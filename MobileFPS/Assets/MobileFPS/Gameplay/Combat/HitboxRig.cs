using System.Collections.Generic;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Combat
{
    /// <summary>
    /// All hitboxes of one character, a broadphase bounding sphere, and the
    /// global registry of shootable characters. Aim assist, auto-fire, hitscan and
    /// lag compensation iterate <see cref="All"/>; nothing ever calls FindObjectsOfType.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(CombatEntity))]
    public sealed class HitboxRig : MonoBehaviour
    {
        private static readonly List<HitboxRig> s_all = new List<HitboxRig>(32);

        [SerializeField] private Hitbox[] hitboxes = new Hitbox[0];
        [Tooltip("Chest-height point used by aim assist and auto-fire.")]
        [SerializeField] private Transform aimPoint;
        [SerializeField] private Transform headPoint;

        private CombatEntity _entity;
        private Health _health;
        private CapsuleShape[] _shapes = new CapsuleShape[0];
        private int _shapesFrame = -1;
        private Vector3 _boundsCenter;
        private float _boundsRadius;

        public static IReadOnlyList<HitboxRig> All => s_all;

        public CombatEntity Entity => _entity;
        public Health Health => _health;
        public EntityId Id => _entity != null ? _entity.Id : EntityId.None;
        public bool IsAlive => _health == null || !_health.IsDead;
        public int ShapeCount => _shapes.Length;
        public Vector3 BoundsCenter { get { EnsureShapes(); return _boundsCenter; } }
        public float BoundsRadius { get { EnsureShapes(); return _boundsRadius; } }

        public Vector3 AimPointPosition => aimPoint != null ? aimPoint.position : transform.position + Vector3.up * 1.3f;
        public Vector3 HeadPointPosition => headPoint != null ? headPoint.position : transform.position + Vector3.up * 1.65f;

        private void Awake()
        {
            _entity = GetComponent<CombatEntity>();
            _health = GetComponent<Health>();
            if (hitboxes == null || hitboxes.Length == 0) hitboxes = GetComponentsInChildren<Hitbox>(true);
            _shapes = new CapsuleShape[hitboxes.Length];
        }

        private void OnEnable() => s_all.Add(this);
        private void OnDisable() => s_all.Remove(this);

        /// <summary>Re-reads bone transforms after the hierarchy changes at runtime (ragdoll swap, LOD rig).</summary>
        public void RebuildHitboxList()
        {
            hitboxes = GetComponentsInChildren<Hitbox>(true);
            _shapes = new CapsuleShape[hitboxes.Length];
            _shapesFrame = -1;
        }

        /// <summary>World-space shapes for this frame (computed at most once per frame, however many rays test them).</summary>
        public CapsuleShape[] GetWorldShapes()
        {
            EnsureShapes();
            return _shapes;
        }

        /// <summary>Forces recomputation (call after animation, e.g. when recording lag-compensation history in LateUpdate).</summary>
        public void RefreshShapes()
        {
            for (int i = 0; i < hitboxes.Length; i++) _shapes[i] = hitboxes[i].GetWorldShape();
            HitShapes.ComputeBounds(_shapes, 0, _shapes.Length, out _boundsCenter, out _boundsRadius);
            _shapesFrame = Time.frameCount;
        }

        public bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, out HitboxHit hit)
        {
            hit = default;
            EnsureShapes();
            if (!HitShapes.RayShapes(origin, direction, maxDistance, _shapes, 0, _shapes.Length,
                    _boundsCenter, _boundsRadius, out float distance, out HitZone zone)) return false;

            hit = new HitboxHit { Entity = Id, Zone = zone, Distance = distance, Point = origin + direction * distance };
            return true;
        }

        private void EnsureShapes()
        {
            if (_shapesFrame != Time.frameCount) RefreshShapes();
        }
    }
}
