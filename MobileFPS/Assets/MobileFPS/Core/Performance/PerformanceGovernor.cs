using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Watches smoothed frame time and steps render resolution down/up with
    /// hysteresis. Phones throttle after a few minutes of sustained load; holding a
    /// stable 60 at 85% resolution beats stuttering between 40 and 60 at native
    /// resolution, especially for aim tracking.
    ///
    /// Applies <see cref="ScalableBufferManager"/> (dynamic resolution, on cameras
    /// with allowDynamicResolution) and raises <see cref="PerformanceTierChangedEvent"/>
    /// so a URP adapter can set renderScale and gameplay can trim effects
    /// (fewer impact particles, no shell casings, and so on).
    /// </summary>
    public sealed class PerformanceGovernor : MonoBehaviour
    {
        private MobilePerformanceSettings _settings;
        private float _smoothedFrameTime;
        private float _overBudgetTimer;
        private float _headroomTimer;
        private int _tier;

        public int CurrentTier => _tier;

        public void Initialize(MobilePerformanceSettings settings)
        {
            _settings = settings;
            _smoothedFrameTime = 1f / Mathf.Max(30, settings.combatFrameRate);
        }

        private void Update()
        {
            if (_settings == null || !MobilePerformance.InCombatMode) return;

            float budget = Application.targetFrameRate > 0 ? 1f / Application.targetFrameRate : 1f / 60f;

            // EMA filters out single spikes (GC, asset loads); we only care about sustained cost.
            _smoothedFrameTime = Mathf.Lerp(_smoothedFrameTime, Time.unscaledDeltaTime, 0.05f);
            float dt = Time.unscaledDeltaTime;

            if (_smoothedFrameTime > budget * _settings.overBudgetRatio)
            {
                _overBudgetTimer += dt;
                _headroomTimer = 0f;
                if (_overBudgetTimer >= _settings.downgradeAfterSeconds) StepTier(+1);
            }
            else if (_smoothedFrameTime < budget * _settings.headroomRatio)
            {
                _headroomTimer += dt;
                _overBudgetTimer = 0f;
                if (_headroomTimer >= _settings.upgradeAfterSeconds) StepTier(-1);
            }
            else
            {
                _overBudgetTimer = 0f;
                _headroomTimer = 0f;
            }
        }

        private void StepTier(int direction)
        {
            _overBudgetTimer = 0f;
            _headroomTimer = 0f;
            int maxTier = Mathf.Max(0, _settings.renderScaleTiers.Length - 1);
            int next = Mathf.Clamp(_tier + direction, 0, maxTier);
            if (next == _tier) return;
            _tier = next;

            float scale = _settings.renderScaleTiers.Length > 0 ? _settings.renderScaleTiers[_tier] : 1f;
            ScalableBufferManager.ResizeBuffers(scale, scale);
            EventBus<PerformanceTierChangedEvent>.Raise(new PerformanceTierChangedEvent { Tier = _tier, RenderScale = scale });
        }
    }
}
