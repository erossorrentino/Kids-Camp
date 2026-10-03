using MobileFPS.Economy;
using MobileFPS.LiveOps;
using MobileFPS.Match;
using MobileFPS.Meta;
using MobileFPS.Monetization;
using MobileFPS.Networking;
using MobileFPS.Profile;
using UnityEngine;

namespace MobileFPS.UI
{
    /// <summary>
    /// Developer panel (IMGUI) that drives every engagement and monetization flow
    /// end-to-end before real UI art exists: daily reward + ad boost, battle pass
    /// claims/premium/tier skips, challenges, post-match 2x ad, IAP purchases
    /// (mock store in the Editor), and switching hit authority to loopback to
    /// feel lag compensation at a simulated ping.
    ///
    /// Destroys itself in release builds. IMGUI allocates every frame, which is
    /// fine for a debug tool and never for shipping UI.
    /// </summary>
    public sealed class MetaDebugPanel : MonoBehaviour
    {
        [SerializeField] private bool startOpen;
        [SerializeField] private MatchController match;

        private bool _open;
        private Vector2 _scroll;
        private string _lastMessage = string.Empty;
        private GUIStyle _box;

        private void Awake()
        {
            if (!Application.isEditor && !Debug.isDebugBuild)
            {
                Destroy(this);
                return;
            }
            _open = startOpen;
        }

        private void OnGUI()
        {
            float scale = Mathf.Max(1f, Screen.dpi / 160f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            float width = Screen.width / scale;
            float height = Screen.height / scale;

            if (GUI.Button(new Rect(width - 70f, 4f, 66f, 26f), _open ? "Close" : "META")) _open = !_open;
            if (!_open) return;

            MetaGame meta = MetaGame.Instance;
            if (meta == null || !meta.IsReady) return;
            _box ??= new GUIStyle(GUI.skin.box) { alignment = TextAnchor.UpperLeft, wordWrap = true };

            GUILayout.BeginArea(new Rect(8f, 34f, Mathf.Min(420f, width - 16f), height - 42f), GUI.skin.window);
            _scroll = GUILayout.BeginScrollView(_scroll);

            DrawWallet(meta);
            DrawDaily(meta);
            DrawBattlePass(meta);
            DrawChallenges(meta);
            DrawMatch(meta);
            DrawStore(meta);
            DrawNetwork();

            if (!string.IsNullOrEmpty(_lastMessage)) GUILayout.Label(_lastMessage, _box);
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        private void DrawWallet(MetaGame meta)
        {
            GUILayout.Label($"Credits {meta.Wallet.Get(CurrencyType.Credits):N0}   Gems {meta.Wallet.Get(CurrencyType.Gems):N0}", _box);
            string doubleXp = meta.Progression.IsDoubleXpActive ? $"   2XP {meta.Progression.DoubleXpRemaining:hh\\:mm\\:ss}" : string.Empty;
            GUILayout.Label($"Level {meta.Progression.AccountLevel}  ({meta.Progression.XpIntoLevel:N0}/{meta.Progression.XpForNextLevel:N0} XP){doubleXp}", _box);
        }

        private void DrawDaily(MetaGame meta)
        {
            DailyRewardService daily = meta.DailyRewards;
            GUILayout.Label($"Daily: {daily.Status}  next: {daily.PreviewNext()}  reset in {daily.TimeUntilReset:hh\\:mm}", _box);
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Claim daily")) _lastMessage = daily.TryClaim(out RewardBundle granted) ? $"Claimed {granted}" : "Nothing to claim";
            GUI.enabled = daily.CanBoostToday;
            if (GUILayout.Button("2x with ad")) meta.BoostDailyRewardWithAd(ok => _lastMessage = ok ? "Daily reward doubled" : "Ad not completed");
            GUI.enabled = true;
            GUILayout.EndHorizontal();
        }

        private void DrawBattlePass(MetaGame meta)
        {
            BattlePassService pass = meta.BattlePass;
            GUILayout.Label($"Battle pass {pass.Season.displayName}: tier {pass.CurrentTier}/{pass.TierCount}  premium:{pass.HasPremium}  unclaimed:{pass.UnclaimedCount}  ends in {pass.TimeRemaining.Days}d", _box);
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Claim all")) _lastMessage = $"Claimed {pass.ClaimAllAvailable()} rewards";
            if (GUILayout.Button($"Premium ({pass.Season.premiumGemPrice} gems)")) _lastMessage = pass.TryPurchasePremiumWithGems() ? "Premium unlocked" : "Can't buy premium";
            if (GUILayout.Button("+1 tier")) _lastMessage = pass.TryBuyTiers(1) ? "Tier bought" : "Can't buy tier";
            GUILayout.EndHorizontal();
        }

        private void DrawChallenges(MetaGame meta)
        {
            DailyChallengeService challenges = meta.Challenges;
            foreach (ChallengeStateData state in challenges.Active)
            {
                if (!challenges.TryGetDefinition(state.challengeId, out ChallengeDefinition definition)) continue;
                GUILayout.BeginHorizontal();
                GUILayout.Label($"{definition.Description}  {state.progress}/{definition.target}{(state.claimed ? "  ✓" : string.Empty)}");
                GUI.enabled = !state.claimed && state.progress >= definition.target;
                if (GUILayout.Button("Claim", GUILayout.Width(60f))) challenges.Claim(state.challengeId);
                GUI.enabled = true;
                GUILayout.EndHorizontal();
            }
            if (challenges.CanClaimAllCompleteBonus && GUILayout.Button("Claim all-complete bonus")) challenges.ClaimAllCompleteBonus();
        }

        private void DrawMatch(MetaGame meta)
        {
            if (match != null && match.IsRunning && GUILayout.Button("End match now")) match.Forfeit();

            var rewards = meta.MatchRewards;
            if (rewards.LastMatchId == null) return;
            GUILayout.Label($"Last match: +{rewards.LastRewards.Credits} credits, +{rewards.LastRewards.AccountXp} XP, +{rewards.LastRewards.BattlePassXp} BP XP" +
                            (rewards.LastRewards.FirstWinBonusApplied ? "  (first win bonus!)" : string.Empty), _box);
            GUI.enabled = rewards.CanDoubleLastMatch && AdsManager.Instance.IsRewardedAvailable(AdsConfig.PostMatchDoublePlacement);
            if (GUILayout.Button($"Watch ad: double {rewards.DoubleOfferCredits} credits"))
            {
                rewards.DoubleLastMatchWithAd(ok => _lastMessage = ok ? "Credits doubled!" : "Ad not completed");
            }
            GUI.enabled = true;
        }

        private void DrawStore(MetaGame meta)
        {
            IAPStoreManager store = IAPStoreManager.Instance;
            GUILayout.Label($"Store ({store.BackendName}, ready: {store.IsInitialized})", _box);
            foreach (StoreProductDefinition product in store.Catalog.products)
            {
                if (product == null) continue;
                PurchaseStatus can = store.CanPurchase(product.productId);
                string bonus = store.IsFirstPurchaseBonusAvailable(product.productId) ? "  2x FIRST BUY" : string.Empty;
                GUILayout.BeginHorizontal();
                GUILayout.Label($"{product.displayName}{bonus}  {product.badge}");
                GUI.enabled = can == PurchaseStatus.Success;
                if (GUILayout.Button(can == PurchaseStatus.Success ? store.GetPriceString(product.productId) : can.ToString(), GUILayout.Width(110f)))
                {
                    store.Purchase(product.productId, result => _lastMessage = $"{result.ProductId}: {result.Status} {result.Message}");
                }
                GUI.enabled = true;
                GUILayout.EndHorizontal();
            }
        }

        private static void DrawNetwork()
        {
            CombatAuthority authority = CombatAuthority.Instance;
            if (authority == null) return;
            GUILayout.BeginHorizontal();
            GUILayout.Label($"Hit authority: {authority.Mode}");
            if (GUILayout.Button("Local")) authority.Mode = HitAuthorityMode.LocalAuthoritative;
            if (GUILayout.Button("Loopback (lag comp)")) authority.Mode = HitAuthorityMode.LoopbackServer;
            GUILayout.EndHorizontal();
        }
    }
}
