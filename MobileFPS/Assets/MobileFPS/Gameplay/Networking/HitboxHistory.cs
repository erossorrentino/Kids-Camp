using System.Collections.Generic;
using MobileFPS.Combat;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Networking
{
    /// <summary>
    /// Lag-compensation history: a ring buffer of every character's world-space
    /// hit capsules over the last ~1 second, recorded on the authority each tick.
    /// When a shot arrives stamped with the client's view time, the server
    /// interpolates hitboxes to that instant and tests the ray against where
    /// targets actually were on the shooter's screen ("favor the shooter").
    ///
    /// Memory is preallocated: (frames x rigs x shapes) capsules, ~0.8 MB for 64
    /// frames x 24 rigs x 16 shapes. Recording and querying allocate nothing.
    /// No colliders move, so there is no Physics.SyncTransforms and no restore pass.
    /// </summary>
    public sealed class HitboxHistory
    {
        private struct FrameHeader
        {
            public double Time;
            public int RigCount;
        }

        private struct RigRecord
        {
            public int EntityId;
            public int ShapeCount;
            public Vector3 BoundsCenter;
            public float BoundsRadius;
        }

        private readonly int _frameCapacity;
        private readonly int _maxRigs;
        private readonly int _maxShapesPerRig;
        private readonly FrameHeader[] _frames;
        private readonly RigRecord[] _rigs;
        private readonly CapsuleShape[] _shapes;
        private readonly CapsuleShape[] _scratch;
        private int _newest = -1;
        private int _count;
        private bool _warnedRigOverflow;

        public HitboxHistory(int frameCapacity = 64, int maxRigs = 24, int maxShapesPerRig = 16)
        {
            _frameCapacity = Mathf.Max(2, frameCapacity);
            _maxRigs = Mathf.Max(1, maxRigs);
            _maxShapesPerRig = Mathf.Max(1, maxShapesPerRig);
            _frames = new FrameHeader[_frameCapacity];
            _rigs = new RigRecord[_frameCapacity * _maxRigs];
            _shapes = new CapsuleShape[_frameCapacity * _maxRigs * _maxShapesPerRig];
            _scratch = new CapsuleShape[_maxShapesPerRig];
        }

        public int FrameCount => _count;
        public double NewestTime => _count > 0 ? _frames[_newest].Time : double.NegativeInfinity;
        public double OldestTime => _count > 0 ? _frames[OldestIndex].Time : double.NegativeInfinity;

        private int OldestIndex => (_newest - _count + 1 + _frameCapacity) % _frameCapacity;

        public void Clear()
        {
            _newest = -1;
            _count = 0;
        }

        /// <summary>Records every living rig. Call on the authority after animation (LateUpdate).</summary>
        public void Record(double time, IReadOnlyList<HitboxRig> rigs)
        {
            BeginFrame(time);
            for (int i = 0; i < rigs.Count; i++)
            {
                HitboxRig rig = rigs[i];
                if (!rig.IsAlive) continue;
                rig.RefreshShapes();
                AddRig(rig.Id, rig.GetWorldShapes(), rig.ShapeCount);
            }
        }

        /// <summary>Starts a frame. Recording the same (or an older) time again overwrites the newest frame.</summary>
        public void BeginFrame(double time)
        {
            if (_count == 0 || time > _frames[_newest].Time)
            {
                _newest = (_newest + 1) % _frameCapacity;
                if (_count < _frameCapacity) _count++;
            }
            _frames[_newest] = new FrameHeader { Time = time, RigCount = 0 };
        }

        public void AddRig(EntityId entity, CapsuleShape[] shapes, int shapeCount)
        {
            if (_count == 0) return;
            ref FrameHeader frame = ref _frames[_newest];
            if (frame.RigCount >= _maxRigs)
            {
                if (!_warnedRigOverflow)
                {
                    _warnedRigOverflow = true;
                    Debug.LogWarning($"[HitboxHistory] More than {_maxRigs} rigs; extra rigs are not lag-compensated. Raise maxRigs.");
                }
                return;
            }

            int rigSlot = _newest * _maxRigs + frame.RigCount;
            int count = Mathf.Min(shapeCount, _maxShapesPerRig);
            int shapeBase = rigSlot * _maxShapesPerRig;
            System.Array.Copy(shapes, 0, _shapes, shapeBase, count);
            HitShapes.ComputeBounds(_shapes, shapeBase, count, out Vector3 center, out float radius);
            _rigs[rigSlot] = new RigRecord { EntityId = entity.Value, ShapeCount = count, BoundsCenter = center, BoundsRadius = radius };
            frame.RigCount++;
        }

        /// <summary>
        /// Ray test against hitboxes as they were at <paramref name="time"/>
        /// (interpolated between recorded frames, clamped to the recorded window).
        /// </summary>
        public bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, double time, EntityId ignore, out HitboxHit hit)
        {
            hit = default;
            if (!FindBracket(time, out int older, out int newer, out float alpha)) return false;

            bool found = false;
            float best = maxDistance;
            int olderRigCount = _frames[older].RigCount;

            for (int r = 0; r < olderRigCount; r++)
            {
                int olderSlot = older * _maxRigs + r;
                RigRecord olderRig = _rigs[olderSlot];
                if (olderRig.EntityId == ignore.Value) continue;

                // Pair with the same entity in the newer frame. If it despawned (or its rig
                // changed shape count) between frames, fall back to the older pose.
                int newerSlot = newer == older ? olderSlot : FindRigSlot(newer, olderRig.EntityId);
                bool canBlend = newerSlot >= 0 && _rigs[newerSlot].ShapeCount == olderRig.ShapeCount;
                int count = olderRig.ShapeCount;

                Vector3 center;
                float radius;
                CapsuleShape[] source;
                int start;
                if (canBlend && newerSlot != olderSlot)
                {
                    int olderBase = olderSlot * _maxShapesPerRig;
                    int newerBase = newerSlot * _maxShapesPerRig;
                    for (int s = 0; s < count; s++)
                    {
                        _scratch[s] = CapsuleShape.Lerp(_shapes[olderBase + s], _shapes[newerBase + s], alpha);
                    }
                    RigRecord newerRig = _rigs[newerSlot];
                    center = Vector3.Lerp(olderRig.BoundsCenter, newerRig.BoundsCenter, alpha);
                    radius = Mathf.Max(olderRig.BoundsRadius, newerRig.BoundsRadius) + Vector3.Distance(olderRig.BoundsCenter, newerRig.BoundsCenter);
                    source = _scratch;
                    start = 0;
                }
                else
                {
                    center = olderRig.BoundsCenter;
                    radius = olderRig.BoundsRadius;
                    source = _shapes;
                    start = olderSlot * _maxShapesPerRig;
                }

                if (HitShapes.RayShapes(origin, direction, best, source, start, count, center, radius, out float distance, out HitZone zone)
                    && distance < best)
                {
                    best = distance;
                    found = true;
                    hit = new HitboxHit
                    {
                        Entity = new EntityId(olderRig.EntityId),
                        Zone = zone,
                        Distance = distance,
                        Point = origin + direction * distance,
                    };
                }
            }
            return found;
        }

        private bool FindBracket(double time, out int older, out int newer, out float alpha)
        {
            older = newer = -1;
            alpha = 0f;
            if (_count == 0) return false;

            if (time >= _frames[_newest].Time)
            {
                older = newer = _newest;
                return true;
            }

            int oldest = OldestIndex;
            if (time <= _frames[oldest].Time)
            {
                older = newer = oldest; // older than our window: best effort, clamp
                return true;
            }

            int index = _newest;
            for (int k = 0; k < _count - 1; k++)
            {
                int previous = (index - 1 + _frameCapacity) % _frameCapacity;
                double previousTime = _frames[previous].Time;
                if (previousTime <= time)
                {
                    double span = _frames[index].Time - previousTime;
                    older = previous;
                    newer = index;
                    alpha = span > 1e-9 ? (float)((time - previousTime) / span) : 0f;
                    return true;
                }
                index = previous;
            }
            return false;
        }

        private int FindRigSlot(int frame, int entityId)
        {
            int count = _frames[frame].RigCount;
            int baseSlot = frame * _maxRigs;
            for (int r = 0; r < count; r++)
            {
                if (_rigs[baseSlot + r].EntityId == entityId) return baseSlot + r;
            }
            return -1;
        }
    }

    /// <summary>Adapts <see cref="HitboxHistory"/> to <see cref="IHitboxQuery"/> at a chosen rewind time (reused, not allocated per shot).</summary>
    public sealed class RewoundHitboxQuery : IHitboxQuery
    {
        private readonly HitboxHistory _history;

        public RewoundHitboxQuery(HitboxHistory history)
        {
            _history = history;
        }

        public double Time { get; set; }

        public bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, EntityId ignore, out HitboxHit hit)
        {
            return _history.Raycast(origin, direction, maxDistance, Time, ignore, out hit);
        }
    }
}
