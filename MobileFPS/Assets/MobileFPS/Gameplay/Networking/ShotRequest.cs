using System;
using System.Runtime.InteropServices;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Networking
{
    [Flags]
    public enum ShotFlags : byte
    {
        None = 0,
        Aiming = 1 << 0,
        Sliding = 1 << 1,
        Airborne = 1 << 2,
        Crouched = 1 << 3,
    }

    /// <summary>
    /// One trigger pull as sent from client to server. It carries the client's
    /// view (where it aimed, and when, in server time) but never claims hits:
    /// the server recomputes those from this data against rewound hitboxes. A
    /// modified client can lie about aim (aimbots need separate statistical
    /// detection) but cannot invent hits through walls, fire faster than the
    /// weapon allows, or hit something it couldn't have seen.
    /// </summary>
    public struct ShotRequest
    {
        public uint Sequence;          // monotonically increasing per shooter
        public EntityId Shooter;
        public ushort WeaponNetId;
        public double ViewTime;        // server-clock time of the world state the client was looking at
        public Vector3 Origin;
        public Vector3 Direction;      // normalized
        public float SpreadDegrees;    // cone half-angle the client used
        public uint Seed;              // reproduces pellet spread server-side
        public ShotFlags Flags;
    }

    /// <summary>
    /// Compact binary encoding of <see cref="ShotRequest"/>: 41 bytes vs ~70 for
    /// naive floats. Shots are the highest-frequency gameplay message (an SMG
    /// sends ~15/s), and on mobile networks every byte costs latency and battery.
    ///
    /// - Direction: octahedral encoding, 2 x 16 bits. Measured worst-case error
    ///   is 0.004° (under 1 cm at 100 m), well under hitbox tolerances (see tests).
    /// - Spread: 0.01° steps in 16 bits.
    /// - Origin stays full precision: hit registration is most sensitive to it.
    ///
    /// Little-endian, allocation-free (caller supplies the buffer).
    /// </summary>
    public static class ShotPacketCodec
    {
        public const int Size = 4 + 4 + 2 + 8 + 12 + 4 + 2 + 4 + 1; // 41 bytes

        public static int Write(in ShotRequest shot, byte[] buffer, int offset)
        {
            if (buffer == null || buffer.Length - offset < Size) throw new ArgumentException("Buffer too small for ShotRequest.");
            int p = offset;
            WriteUInt(buffer, ref p, shot.Sequence);
            WriteUInt(buffer, ref p, (uint)shot.Shooter.Value);
            WriteUShort(buffer, ref p, shot.WeaponNetId);
            WriteULong(buffer, ref p, (ulong)BitConverter.DoubleToInt64Bits(shot.ViewTime));
            WriteFloat(buffer, ref p, shot.Origin.x);
            WriteFloat(buffer, ref p, shot.Origin.y);
            WriteFloat(buffer, ref p, shot.Origin.z);
            OctahedralEncode(shot.Direction, out ushort ox, out ushort oy);
            WriteUShort(buffer, ref p, ox);
            WriteUShort(buffer, ref p, oy);
            WriteUShort(buffer, ref p, (ushort)Mathf.Clamp(Mathf.RoundToInt(shot.SpreadDegrees * 100f), 0, ushort.MaxValue));
            WriteUInt(buffer, ref p, shot.Seed);
            buffer[p++] = (byte)shot.Flags;
            return p - offset;
        }

        public static ShotRequest Read(byte[] buffer, int offset)
        {
            if (buffer == null || buffer.Length - offset < Size) throw new ArgumentException("Buffer too small for ShotRequest.");
            int p = offset;
            var shot = new ShotRequest
            {
                Sequence = ReadUInt(buffer, ref p),
                Shooter = new EntityId((int)ReadUInt(buffer, ref p)),
                WeaponNetId = ReadUShort(buffer, ref p),
                ViewTime = BitConverter.Int64BitsToDouble((long)ReadULong(buffer, ref p)),
            };
            shot.Origin = new Vector3(ReadFloat(buffer, ref p), ReadFloat(buffer, ref p), ReadFloat(buffer, ref p));
            ushort ox = ReadUShort(buffer, ref p);
            ushort oy = ReadUShort(buffer, ref p);
            shot.Direction = OctahedralDecode(ox, oy);
            shot.SpreadDegrees = ReadUShort(buffer, ref p) / 100f;
            shot.Seed = ReadUInt(buffer, ref p);
            shot.Flags = (ShotFlags)buffer[p];
            return shot;
        }

        /// <summary>Unit vector to two 16-bit values (octahedral mapping, Meyer et al. 2010).</summary>
        public static void OctahedralEncode(Vector3 n, out ushort x, out ushort y)
        {
            float l1 = Mathf.Abs(n.x) + Mathf.Abs(n.y) + Mathf.Abs(n.z);
            if (l1 < 1e-12f)
            {
                x = y = 32768;
                return;
            }
            float px = n.x / l1;
            float py = n.y / l1;
            if (n.z < 0f)
            {
                float fx = (1f - Mathf.Abs(py)) * SignNotZero(px);
                float fy = (1f - Mathf.Abs(px)) * SignNotZero(py);
                px = fx;
                py = fy;
            }
            x = (ushort)Mathf.Clamp(Mathf.RoundToInt((px * 0.5f + 0.5f) * 65535f), 0, 65535);
            y = (ushort)Mathf.Clamp(Mathf.RoundToInt((py * 0.5f + 0.5f) * 65535f), 0, 65535);
        }

        public static Vector3 OctahedralDecode(ushort x, ushort y)
        {
            float fx = x / 65535f * 2f - 1f;
            float fy = y / 65535f * 2f - 1f;
            var v = new Vector3(fx, fy, 1f - Mathf.Abs(fx) - Mathf.Abs(fy));
            if (v.z < 0f)
            {
                float ox = (1f - Mathf.Abs(v.y)) * SignNotZero(v.x);
                float oy = (1f - Mathf.Abs(v.x)) * SignNotZero(v.y);
                v.x = ox;
                v.y = oy;
            }
            return v.normalized;
        }

        private static float SignNotZero(float v) => v >= 0f ? 1f : -1f;

        private static void WriteUShort(byte[] b, ref int p, ushort v)
        {
            b[p++] = (byte)v;
            b[p++] = (byte)(v >> 8);
        }

        private static void WriteUInt(byte[] b, ref int p, uint v)
        {
            b[p++] = (byte)v;
            b[p++] = (byte)(v >> 8);
            b[p++] = (byte)(v >> 16);
            b[p++] = (byte)(v >> 24);
        }

        private static void WriteULong(byte[] b, ref int p, ulong v)
        {
            WriteUInt(b, ref p, (uint)v);
            WriteUInt(b, ref p, (uint)(v >> 32));
        }

        // Explicit-layout union: reinterpret float bits without unsafe code or
        // BitConverter.SingleToInt32Bits (absent from older API compatibility levels).
        [StructLayout(LayoutKind.Explicit)]
        private struct FloatBits
        {
            [FieldOffset(0)] public float Float;
            [FieldOffset(0)] public uint Bits;
        }

        private static void WriteFloat(byte[] b, ref int p, float v)
        {
            WriteUInt(b, ref p, new FloatBits { Float = v }.Bits);
        }

        private static ushort ReadUShort(byte[] b, ref int p)
        {
            ushort v = (ushort)(b[p] | (b[p + 1] << 8));
            p += 2;
            return v;
        }

        private static uint ReadUInt(byte[] b, ref int p)
        {
            uint v = (uint)(b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24));
            p += 4;
            return v;
        }

        private static ulong ReadULong(byte[] b, ref int p)
        {
            ulong lo = ReadUInt(b, ref p);
            ulong hi = ReadUInt(b, ref p);
            return lo | (hi << 32);
        }

        private static float ReadFloat(byte[] b, ref int p)
        {
            return new FloatBits { Bits = ReadUInt(b, ref p) }.Float;
        }
    }
}
