using System.Collections.Generic;
using MobileFPS.Combat;
using MobileFPS.Core;
using MobileFPS.Match;
using MobileFPS.Meta;
using MobileFPS.Player;
using MobileFPS.Weapons;
using UnityEngine;
using UnityEngine.UI;

namespace MobileFPS.UI
{
    /// <summary>
    /// Combat HUD: ammo, health, dynamic crosshair, hit markers, damage vignette,
    /// match timer/score and toasts.
    ///
    /// UI is often the hidden mobile frame-time killer, so this view follows strict rules:
    /// - <b>Write only on change.</b> Every Text/Image write dirties its canvas and
    ///   forces a re-batch, so values are cached and compared first.
    /// - <b>No per-frame strings.</b> Numbers come from a prebuilt 0-999 string table;
    ///   the timer string is rebuilt at most once per second.
    /// - <b>Split canvases.</b> Put fast-changing elements (crosshair, hit marker)
    ///   on their own nested Canvas so they don't re-batch the static HUD.
    /// - <b>No raycasts.</b> Disable "Raycast Target" on HUD graphics; touch input
    ///   bypasses the EventSystem entirely (see TouchInputSource).
    /// </summary>
    public sealed class HudView : MonoBehaviour
    {
        private static readonly string[] s_numbers = BuildNumberTable(1000);

        [SerializeField] private FPSPlayer player;
        [SerializeField] private MatchController match;

        [Header("Ammo")]
        [SerializeField] private Text magazineText;
        [SerializeField] private Text reserveText;
        [SerializeField] private Text weaponNameText;
        [SerializeField] private Image reloadFill;
        [SerializeField] private Color lowAmmoColor = new Color(1f, 0.35f, 0.3f);

        [Header("Health")]
        [SerializeField] private Image healthFill;
        [SerializeField] private Image damageVignette;
        [SerializeField] private float vignetteFadePerSecond = 1.6f;

        [Header("Crosshair")]
        [SerializeField] private CanvasGroup crosshairGroup;
        [SerializeField] private RectTransform crosshairUp;
        [SerializeField] private RectTransform crosshairDown;
        [SerializeField] private RectTransform crosshairLeft;
        [SerializeField] private RectTransform crosshairRight;
        [SerializeField] private float crosshairMinGap = 8f;

        [Header("Hit marker")]
        [SerializeField] private CanvasGroup hitMarker;
        [SerializeField] private Image hitMarkerImage;
        [SerializeField] private float hitMarkerDuration = 0.22f;
        [SerializeField] private Color hitColor = Color.white;
        [SerializeField] private Color headshotColor = new Color(1f, 0.85f, 0.2f);
        [SerializeField] private Color killColor = new Color(1f, 0.25f, 0.2f);

        [Header("Match")]
        [SerializeField] private Text timerText;
        [SerializeField] private Text scoreText;

        [Header("Toasts")]
        [SerializeField] private Text toastText;
        [SerializeField] private float toastSeconds = 2f;

        private readonly Queue<string> _toasts = new Queue<string>(8);
        private Canvas _canvas;
        private Health _health;
        private WeaponController _shownWeapon;
        private int _lastMagazine = -1;
        private int _lastReserve = -1;
        private float _lastHealth = -1f;
        private float _lastGap = -1f;
        private float _lastCrosshairAlpha = -1f;
        private float _lastReload = -1f;
        private int _lastTimerSecond = -1;
        private int _lastKills = -1;
        private int _lastScore = -1;
        private float _hitMarkerTimer;
        private float _vignetteAlpha;
        private float _toastTimer;

        private void Awake()
        {
            _canvas = GetComponentInParent<Canvas>();
            if (player != null) _health = player.GetComponent<Health>();
            if (hitMarker != null) hitMarker.alpha = 0f;
            SetVignette(0f);
            if (toastText != null) toastText.enabled = false;
        }

        private void OnEnable()
        {
            EventBus<HitMarkerEvent>.Subscribe(OnHitMarker);
            EventBus<LocalPlayerDamagedEvent>.Subscribe(OnLocalDamaged);
            EventBus<KillEvent>.Subscribe(OnKill);
            EventBus<ChallengeProgressEvent>.Subscribe(OnChallengeProgress);
            EventBus<AccountLevelUpEvent>.Subscribe(OnLevelUp);
            EventBus<WeaponLevelUpEvent>.Subscribe(OnWeaponLevelUp);
        }

        private void OnDisable()
        {
            EventBus<HitMarkerEvent>.Unsubscribe(OnHitMarker);
            EventBus<LocalPlayerDamagedEvent>.Unsubscribe(OnLocalDamaged);
            EventBus<KillEvent>.Unsubscribe(OnKill);
            EventBus<ChallengeProgressEvent>.Unsubscribe(OnChallengeProgress);
            EventBus<AccountLevelUpEvent>.Unsubscribe(OnLevelUp);
            EventBus<WeaponLevelUpEvent>.Unsubscribe(OnWeaponLevelUp);
        }

        private void LateUpdate()
        {
            float dt = Time.unscaledDeltaTime;
            WeaponController weapon = player != null ? player.Weapons.Current : null;

            UpdateAmmo(weapon);
            UpdateHealth();
            UpdateCrosshair(weapon);
            UpdateHitMarker(dt);
            UpdateVignette(dt);
            UpdateMatch();
            UpdateToasts(dt);
        }

        private void UpdateAmmo(WeaponController weapon)
        {
            if (weapon != _shownWeapon)
            {
                _shownWeapon = weapon;
                _lastMagazine = _lastReserve = -1;
                if (weaponNameText != null) weaponNameText.text = weapon != null ? weapon.Definition.displayName : string.Empty;
            }
            if (weapon == null) return;

            if (weapon.AmmoInMagazine != _lastMagazine && magazineText != null)
            {
                _lastMagazine = weapon.AmmoInMagazine;
                magazineText.text = Number(_lastMagazine);
                bool low = _lastMagazine <= Mathf.Max(1, weapon.Stats.MagazineSize / 4);
                magazineText.color = low ? lowAmmoColor : Color.white;
            }
            if (weapon.ReserveAmmo != _lastReserve && reserveText != null)
            {
                _lastReserve = weapon.ReserveAmmo;
                reserveText.text = Number(_lastReserve);
            }

            float reload = weapon.IsReloading ? weapon.ReloadProgress : 0f;
            if (reloadFill != null && Mathf.Abs(reload - _lastReload) > 0.01f)
            {
                _lastReload = reload;
                reloadFill.fillAmount = reload;
                reloadFill.enabled = weapon.IsReloading;
            }
        }

        private void UpdateHealth()
        {
            if (_health == null || healthFill == null) return;
            float normalized = _health.Normalized;
            if (Mathf.Abs(normalized - _lastHealth) < 0.005f) return;
            _lastHealth = normalized;
            healthFill.fillAmount = normalized;
            healthFill.color = Color.Lerp(new Color(0.9f, 0.2f, 0.2f), new Color(0.3f, 0.95f, 0.45f), normalized);
        }

        private void UpdateCrosshair(WeaponController weapon)
        {
            if (crosshairGroup == null || weapon == null || player == null) return;

            // Hidden while aiming down sights: the sights are the crosshair.
            float alpha = 1f - Mathf.Clamp01(weapon.AdsBlend * 1.5f);
            if (Mathf.Abs(alpha - _lastCrosshairAlpha) > 0.01f)
            {
                _lastCrosshairAlpha = alpha;
                crosshairGroup.alpha = alpha;
            }
            if (alpha <= 0f) return;

            // Spread half-angle -> screen pixels -> canvas units: the crosshair shows the
            // real cone bullets can land in.
            float fov = player.CameraController.CurrentFov;
            float pixels = Mathf.Tan(weapon.CurrentSpreadDegrees * Mathf.Deg2Rad) / Mathf.Tan(fov * 0.5f * Mathf.Deg2Rad) * (Screen.height * 0.5f);
            float scale = _canvas != null ? _canvas.scaleFactor : 1f;
            float gap = Mathf.Max(crosshairMinGap, pixels / Mathf.Max(0.01f, scale));
            if (Mathf.Abs(gap - _lastGap) < 0.5f) return;
            _lastGap = gap;

            if (crosshairUp != null) crosshairUp.anchoredPosition = new Vector2(0f, gap);
            if (crosshairDown != null) crosshairDown.anchoredPosition = new Vector2(0f, -gap);
            if (crosshairLeft != null) crosshairLeft.anchoredPosition = new Vector2(-gap, 0f);
            if (crosshairRight != null) crosshairRight.anchoredPosition = new Vector2(gap, 0f);
        }

        private void UpdateHitMarker(float dt)
        {
            if (hitMarker == null || _hitMarkerTimer <= 0f) return;
            _hitMarkerTimer -= dt;
            hitMarker.alpha = Mathf.Clamp01(_hitMarkerTimer / hitMarkerDuration);
        }

        private void UpdateVignette(float dt)
        {
            // Low health keeps a faint persistent vignette; hits spike it.
            float floor = _health != null && !_health.IsDead ? Mathf.Clamp01(0.45f - _health.Normalized) : 0f;
            float next = Mathf.Max(floor, _vignetteAlpha - vignetteFadePerSecond * dt);
            if (Mathf.Abs(next - _vignetteAlpha) < 0.003f) return;
            SetVignette(next);
        }

        private void UpdateMatch()
        {
            if (match == null) return;

            int seconds = Mathf.CeilToInt(match.TimeRemaining);
            if (seconds != _lastTimerSecond && timerText != null)
            {
                _lastTimerSecond = seconds;
                timerText.text = $"{seconds / 60}:{seconds % 60:00}"; // once per second at most
            }

            match.GetLocalStats(out int kills, out _, out int score);
            if ((kills != _lastKills || score != _lastScore) && scoreText != null)
            {
                _lastKills = kills;
                _lastScore = score;
                scoreText.text = $"{kills} / {match.ScoreLimit}   {score}";
            }
        }

        private void UpdateToasts(float dt)
        {
            if (toastText == null) return;
            if (_toastTimer > 0f)
            {
                _toastTimer -= dt;
                if (_toastTimer <= 0f) toastText.enabled = false;
                return;
            }
            if (_toasts.Count == 0) return;
            toastText.text = _toasts.Dequeue();
            toastText.enabled = true;
            _toastTimer = toastSeconds;
        }

        private void OnHitMarker(in HitMarkerEvent evt)
        {
            if (hitMarker == null) return;
            _hitMarkerTimer = hitMarkerDuration;
            hitMarker.alpha = 1f;
            if (hitMarkerImage != null) hitMarkerImage.color = evt.IsKill ? killColor : evt.IsHeadshot ? headshotColor : hitColor;
        }

        private void OnLocalDamaged(in LocalPlayerDamagedEvent evt)
        {
            SetVignette(Mathf.Clamp01(_vignetteAlpha + evt.Amount / 60f));
        }

        private void OnKill(in KillEvent evt)
        {
            if (!evt.KillerIsLocalPlayer || evt.VictimIsLocalPlayer) return;
            if ((evt.Flags & KillFlags.Headshot) != 0) _toasts.Enqueue("HEADSHOT KILL");
            else if ((evt.Flags & KillFlags.Longshot) != 0) _toasts.Enqueue("LONGSHOT KILL");
            else if ((evt.Flags & KillFlags.WhileSliding) != 0) _toasts.Enqueue("SLIDE KILL");
            else _toasts.Enqueue("KILL");
            if (hitMarkerImage != null) hitMarkerImage.color = killColor;
        }

        private void OnChallengeProgress(in ChallengeProgressEvent evt)
        {
            if (evt.JustCompleted) _toasts.Enqueue("Challenge complete!");
        }

        private void OnLevelUp(in AccountLevelUpEvent evt) => _toasts.Enqueue($"LEVEL UP  {evt.NewLevel}");

        private void OnWeaponLevelUp(in WeaponLevelUpEvent evt) => _toasts.Enqueue($"Weapon level {evt.NewLevel}: new attachments");

        private void SetVignette(float alpha)
        {
            _vignetteAlpha = alpha;
            if (damageVignette == null) return;
            Color c = damageVignette.color;
            c.a = alpha;
            damageVignette.color = c;
            damageVignette.enabled = alpha > 0.001f; // disabled graphics cost no fill rate
        }

        private static string Number(int value)
        {
            return value >= 0 && value < s_numbers.Length ? s_numbers[value] : value.ToString();
        }

        private static string[] BuildNumberTable(int count)
        {
            var table = new string[count];
            for (int i = 0; i < count; i++) table[i] = i.ToString();
            return table;
        }
    }
}
