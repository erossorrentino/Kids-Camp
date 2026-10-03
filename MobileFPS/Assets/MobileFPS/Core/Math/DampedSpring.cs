using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Per-frame coefficients for an exact (closed-form) damped harmonic oscillator.
    /// The analytic solution follows Ryan Juckett's "Damped Springs".
    ///
    /// Why closed-form rather than the usual `velocity += force * dt` Euler spring:
    /// mobile frame times are not steady. Thermal throttling, GC, shader warm-up and
    /// OS interrupts produce 50-100 ms spikes, and an Euler spring with a stiff
    /// constant explodes (weapon flies off-screen) on exactly those frames. The
    /// analytic form is unconditionally stable for any dt, and identical at 30, 60
    /// and 120 FPS, so weapon sway and recoil feel the same on a budget phone and a
    /// 120 Hz flagship.
    ///
    /// Compute coefficients once per frame per (frequency, damping) pair, then apply
    /// them to as many floats/vectors as you like: that's 4 multiply-adds per axis.
    /// </summary>
    public readonly struct SpringCoefficients
    {
        public readonly float PosPos, PosVel, VelPos, VelVel;

        private SpringCoefficients(float posPos, float posVel, float velPos, float velVel)
        {
            PosPos = posPos; PosVel = posVel; VelPos = velPos; VelVel = velVel;
        }

        public static readonly SpringCoefficients Identity = new SpringCoefficients(1f, 0f, 0f, 1f);

        /// <param name="angularFrequency">Stiffness in radians/second (2π × oscillations per second). 10-30 feels "snappy".</param>
        /// <param name="dampingRatio">&lt;1 bouncy, 1 critically damped (fastest without overshoot), &gt;1 sluggish.</param>
        /// <param name="deltaTime">Frame time in seconds. Any value is stable.</param>
        public static SpringCoefficients Compute(float angularFrequency, float dampingRatio, float deltaTime)
        {
            const float epsilon = 0.0001f;
            if (dampingRatio < 0f) dampingRatio = 0f;
            if (angularFrequency < epsilon || deltaTime <= 0f) return Identity;

            if (dampingRatio > 1f + epsilon)
            {
                // Over-damped.
                float za = -angularFrequency * dampingRatio;
                float zb = angularFrequency * Mathf.Sqrt(dampingRatio * dampingRatio - 1f);
                float z1 = za - zb;
                float z2 = za + zb;
                float e1 = Mathf.Exp(z1 * deltaTime);
                float e2 = Mathf.Exp(z2 * deltaTime);
                float invTwoZb = 1f / (2f * zb);
                float e1OverTwoZb = e1 * invTwoZb;
                float e2OverTwoZb = e2 * invTwoZb;
                float z1e1OverTwoZb = z1 * e1OverTwoZb;
                float z2e2OverTwoZb = z2 * e2OverTwoZb;

                return new SpringCoefficients(
                    e1OverTwoZb * z2 - z2e2OverTwoZb + e2,
                    -e1OverTwoZb + e2OverTwoZb,
                    (z1e1OverTwoZb - z2e2OverTwoZb + e2) * z2,
                    -z1e1OverTwoZb + z2e2OverTwoZb);
            }

            if (dampingRatio < 1f - epsilon)
            {
                // Under-damped.
                float omegaZeta = angularFrequency * dampingRatio;
                float alpha = angularFrequency * Mathf.Sqrt(1f - dampingRatio * dampingRatio);
                float expTerm = Mathf.Exp(-omegaZeta * deltaTime);
                float cosTerm = Mathf.Cos(alpha * deltaTime);
                float sinTerm = Mathf.Sin(alpha * deltaTime);
                float invAlpha = 1f / alpha;
                float expSin = expTerm * sinTerm;
                float expCos = expTerm * cosTerm;
                float expOmegaZetaSinOverAlpha = expTerm * omegaZeta * sinTerm * invAlpha;

                return new SpringCoefficients(
                    expCos + expOmegaZetaSinOverAlpha,
                    expSin * invAlpha,
                    -expSin * alpha - omegaZeta * expOmegaZetaSinOverAlpha,
                    expCos - expOmegaZetaSinOverAlpha);
            }

            // Critically damped.
            {
                float expTerm = Mathf.Exp(-angularFrequency * deltaTime);
                float timeExp = deltaTime * expTerm;
                float timeExpFreq = timeExp * angularFrequency;

                return new SpringCoefficients(
                    timeExpFreq + expTerm,
                    timeExp,
                    -angularFrequency * timeExpFreq,
                    -timeExpFreq + expTerm);
            }
        }

        public void Apply(ref float position, ref float velocity, float target)
        {
            float oldPos = position - target;
            float oldVel = velocity;
            position = oldPos * PosPos + oldVel * PosVel + target;
            velocity = oldPos * VelPos + oldVel * VelVel;
        }

        public void Apply(ref Vector3 position, ref Vector3 velocity, Vector3 target)
        {
            Vector3 oldPos = position - target;
            Vector3 oldVel = velocity;
            position = oldPos * PosPos + oldVel * PosVel + target;
            velocity = oldPos * VelPos + oldVel * VelVel;
        }
    }

    /// <summary>A Vector3 driven by a closed-form spring. Mutable struct: store it as a field and call methods on the field.</summary>
    public struct SpringVector3
    {
        public Vector3 Value;
        public Vector3 Velocity;

        public void Step(Vector3 target, in SpringCoefficients coefficients)
        {
            coefficients.Apply(ref Value, ref Velocity, target);
        }

        /// <summary>Instantaneous kick (recoil, landing, explosion). Units are value-units per second.</summary>
        public void AddImpulse(Vector3 velocityImpulse)
        {
            Velocity += velocityImpulse;
        }

        public void Reset(Vector3 value)
        {
            Value = value;
            Velocity = Vector3.zero;
        }
    }

    /// <summary>A float driven by a closed-form spring.</summary>
    public struct SpringFloat
    {
        public float Value;
        public float Velocity;

        public void Step(float target, in SpringCoefficients coefficients)
        {
            coefficients.Apply(ref Value, ref Velocity, target);
        }

        public void AddImpulse(float velocityImpulse)
        {
            Velocity += velocityImpulse;
        }

        public void Reset(float value)
        {
            Value = value;
            Velocity = 0f;
        }
    }
}
