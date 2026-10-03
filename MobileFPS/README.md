# MobileFPS: competitive mobile shooter foundation (Unity)

Foundation code for a fast, competitive 3D first-person shooter for Google
Play: snappy touch controls, slide/sprint movement, procedural recoil, aim
assist, server-verifiable lag-compensated hit registration, and a complete
live-service meta layer (rewarded ads, IAP, battle pass, daily rewards,
challenges, progression).

It's about 15,000 lines of C# in 123 files, split into five assemblies plus
optional SDK adapters, with 108 EditMode tests. There is no art: the editor
tooling builds a playable grey-box firing range from primitives in one click.

> **Status, honestly.** Every assembly compiles with zero warnings against
> Unity 2021.3 reference assemblies, and all 108 tests pass (see
> [Verification](#verification)). It has **not** been run inside the Unity
> Editor or on a phone yet: this was built in a headless environment. Expect a
> short first-open shakedown, and see the checklist at the bottom before shipping.

---

## Quick start

1. Open `MobileFPS/` in **Unity 2022.3 LTS** (Unity 6 should also work) via
   Unity Hub, using *Add project from disk*.
2. Menu **MobileFPS > Create Firing Range Scene**. This generates all content
   (6 weapons, attachments, skins, FX, meta configs) under
   `Assets/MobileFPS/Generated` and saves a playable scene.
3. Press **Play**.
   - Editor (keyboard and mouse): WASD to move, mouse to look, LMB fire, RMB
     aim, Shift sprint, C crouch or slide (while sprinting), Space jump, R
     reload, Q switch weapon, Esc to release the cursor.
   - On a device: floating move stick on the left, free look on the right,
     the FIRE button also steers the camera, and pushing the stick past its
     rim locks sprint.
   - The **META** button (top right) opens a debug panel that drives every
     monetization flow: claim the daily reward and its 2x ad boost, battle pass
     claims, premium and tier skips, challenges, end the match and get the 2x
     credits ad offer, buy IAP packs (mock store), and switch hit authority to
     **Loopback** to feel lag compensation at a simulated 120 ms ping.
4. Optional: **MobileFPS > Setup > Apply Recommended Android Settings**
   (IL2CPP/ARM64, AAB, Vulkan+GLES3, incremental GC, ASTC, landscape).

The firing range has static targets at 10/25/50/80 m, strafing targets,
targets behind penetrable wood and behind a metal wall (only the sniper
penetrates it), and a ramp for testing downhill slides.

---

## Architecture

```
MobileFPS.Core        no game knowledge: EventBus, Singleton, pooling, springs,
  ▲   ▲               time providers, save system, mobile perf bootstrap, haptics
  │   │
  │   MobileFPS.Meta  economy, ads, IAP, progression, battle pass, live-ops
  │      ▲            (never references gameplay; listens to Core events)
MobileFPS.Gameplay    controls, player, weapons, combat, hit registration, match
  ▲
MobileFPS.UI          HUD (UGUI) + debug panel           ┐ reference both
MobileFPS.Editor      scene builder, content generator   ┘ gameplay and meta
MobileFPS.Integrations.{AdMob,UnityIAP,Notifications}  compile only if the SDK is installed
```

- **Event-driven boundary.** Gameplay raises `KillEvent`, `MatchEndedEvent`,
  `DamageAppliedEvent` and so on. Meta, UI, haptics and analytics subscribe.
  The meta layer has no reference to a single gameplay type, so progression,
  challenges and rewards can be unit-tested and ported to a server alone.
- **Zero-allocation EventBus** (`Core/Events/EventBus.cs`): one static class
  per struct event type, handlers take `in T`, it is re-entrancy safe
  (subscribe or unsubscribe during dispatch), and one throwing handler can't
  break the others.
- **Singletons** (`Core/Singleton.cs`) for app-lifetime services (ads, store,
  pools, meta). They are duplicate-safe, never resurrected during quit, and
  support Enter Play Mode without domain reload via `StaticReset`.
- **Update orchestration.** `FPSPlayer` owns one `Update` and one `LateUpdate`
  and ticks the motor, camera, weapons and sway in a fixed order (input, aim
  assist, look, move, fire), instead of many components with their own
  `Update`.
- **Data-driven content.** ScriptableObjects define weapons, recoil patterns,
  attachments, skins, battle pass seasons, the daily calendar, challenges,
  store products and ad placements.

---

## Module 1: Player controller and camera

| File | What it does |
|---|---|
| `Gameplay/Controls/TouchInputSource.cs` | Multi-touch: roles fixed at first contact (move, look, button), floating stick with deadzone remap, **sprint lock** past the rim, **fire-button steering**, DPI-normalized look (degrees per inch, corrected for render scale), FIR jitter smoothing, optional gyro (always or ADS-only). Allocation-free. Uses `GetTouch(i)`, never `Input.touches`. |
| `Gameplay/Controls/TouchButton.cs` | Cached circular hit areas with thumb padding. No EventSystem raycasts; any RectTransform works, so HUD layout customization is free. |
| `Gameplay/Controls/PlayerInputRouter.cs` | Samples every source once per frame into a `PlayerInputFrame` (touch + desktop + gamepad merge). The same struct can carry prediction commands or replays. |
| `Gameplay/Player/FPSCharacterMotor.cs` | CharacterController with custom velocity integration: walk, **sprint** (forward-only), crouch, **slide** (boost, friction, slope acceleration, steering, slide-jump momentum), coyote time, jump buffering, ground snapping, wall-velocity removal, headroom checks. `CaptureState`/`RestoreState` support client-side prediction. |
| `Gameplay/Player/FPSCameraController.cs` | Look, **aim-affecting recoil** (permanent + recoverable parts, on the AimPivot), **cosmetic punch and trauma shake** (on the camera, never moves bullets), landing dip, slide/strafe roll, sprint/slide/ADS FOV, Hor+ FOV for 4:3 tablets. |
| `Gameplay/Player/WeaponSway.cs` | Look sway, strafe tilt, distance-synced bob, jump/land bounce, sprint/slide poses, recoil kick, and **automatic sight alignment** from a `SightAnchor`. |
| `Gameplay/Player/AimAssist.cs` | Friction, magnetism (only while the player is inputting), **ADS snap**, optional auto-fire "simple mode". One pass over the hitbox registry plus a throttled line-of-sight ray. |
| `Core/Math/DampedSpring.cs` | Closed-form damped springs: exact at any frame rate and stable through 2-second frame spikes (tested). |

## Module 2: Weapons and hit registration

**Data**: `WeaponDefinition` (fire modes, RPM, burst, pellets, range-bracket
damage, zone multipliers, penetration, spread, handling, ammo, recoil,
projectile, presentation, and a TTK calculator), `RecoilPattern` (learnable
per-shot kicks plus seeded randomness), `AttachmentDefinition` (percentage
stat trade-offs), `WeaponStats` (final numbers after attachments, clamped),
`WeaponSkinDefinition` (cosmetic only), `WeaponDatabase` (2-byte network ids).
The weapon inspector shows a **live TTK table** by range and hit zone.

**Runtime**: `WeaponController` uses an accumulator fire cadence, so DPS is
identical at 25 and 120 FPS. It also handles sprint-to-fire, ADS blend, bloom,
tactical/empty/per-round reloads, auto-reload, and burst buffering.
`WeaponInventory` handles switching and meta loadouts.

**Hit registration pipeline** (`Gameplay/Networking/CombatAuthority.cs`):

```
fire ─► ShotRequest (41 bytes: seq, shooter, weapon, view time, origin,
        │            octahedral direction, spread, seed, flags)
        ├─► client: HitscanSolver vs LIVE hitboxes ─► impacts, tracers, predicted hit marker (0 ms)
        └─► authority (local | loopback | remote server):
              ServerShotValidator ─► rewind HitboxHistory to view time ─► same HitscanSolver ─► DamageSystem
```

- **Hitboxes are analytic capsules, not PhysX colliders**
  (`Combat/HitShapes.cs`). That means no per-bone colliders in the
  broadphase, and rewinding is a buffer lerp with no `SyncTransforms`.
  Client prediction and server authority also run *the same function*.
- **Lag compensation** (`HitboxHistory.cs`): a preallocated ring buffer
  (~1 s), interpolated between frames, with the rewind capped at 300 ms.
- **Server verification** (`ServerShotValidator.cs`) checks sequence replay,
  time window, client-time cadence, a server-time token bucket (stops
  rapid-fire mods even when the client lies about time), ammo, an origin
  plausibility check that allows for latency, and a spread floor. Pellet
  spread is reproduced from the seed, so clients can't pick favorable pellets.
- **Penetration and falloff**: surfaces carry penetration costs (wood is
  cheap, concrete blocks), and damage is scaled per surface passed.
- **Pooling** (`Core/Pooling`): prewarm, inactive-parent instantiation (no
  Awake flash), `KeepActive` mode for particle FX, Reject overflow for cosmetics,
  one loop for all timed despawns, a flat hierarchy in builds, and low-memory
  trimming. Impacts have a per-frame budget, distance culling and a decal ring
  buffer. Tracers and projectiles update in single batched loops.

## Module 3: Engagement and monetization

| Feature | Where | Key design |
|---|---|---|
| **Rewarded ads** | `Meta/Monetization/Ads` | `AdsManager.ShowRewarded(placement, result => …)`. Ads are always preloaded, with exponential backoff, reward only on the SDK's reward callback, main-thread marshalling, an SSV nonce, and per-placement daily caps and cooldowns. Rewarded-only by design: no interstitials. |
| **2x match currency** | `Meta/Progression/PostMatchRewardService.cs` | Idempotent per match id, the extra credits granted only after the ad, the offer expiring at the next match start, and no offer for very short matches. |
| **IAP store** | `Meta/Monetization/Store` | Validate, then grant and persist, then acknowledge, deduplicated by transaction id (crash and replay safe). Deferred payments, first-purchase 2x bonus, purchase limits, starter pack gated by level, localized prices. `IReceiptValidator` hook for server validation. |
| **Virtual shop** | `Meta/Monetization/Shop` | Gems buy skins and bundles: sale prices, limited-time windows, duplicate-purchase protection. |
| **Progression** | `Meta/Progression` | Account levels with rewards, weapon levels (attachment unlocks), stackable double-XP tokens, first-win-of-the-day bonus. |
| **Battle pass** | `Meta/LiveOps/BattlePass*` | Free and premium tracks, retroactive premium unlock, tier skips, season rollover, an unclaimed-rewards badge. The default ladder pays back more gems than the next pass costs. |
| **Daily rewards** | `Meta/LiveOps/DailyReward*` | 7-day escalating calendar, consecutive streak with a grace day (or cumulative mode), global UTC reset, clock-rollback protection, rewarded-ad 2x boost. |
| **Daily challenges** | `Meta/LiveOps/DailyChallengeService.cs` | Three per day, deterministic from hash(player, day), tracked purely from events, battle pass XP rewards, all-complete bonus. |
| **Re-engagement** | `Meta/LiveOps/Reengagement.cs` | Local notifications tied to real value (reward ready, streak at risk, season ending), quiet hours, spacing, contextual permission ask. |
| **Analytics** | `Meta/Analytics/Telemetry.cs` | Every economy source and sink, ad, IAP and progression event, with pluggable sinks. |
| **Composition root** | `Meta/MetaGame.cs` | Wires everything, saves synchronously on pause (Android), plans notifications on background, rotates dailies on resume. |

### SDK integrations (optional assemblies)

Each adapter lives in its own assembly with a version define, so it compiles
only when the SDK is present and registers itself at startup. Without them
you get the mock ad network and mock store (Editor and development builds).

| SDK | Install | Adapter |
|---|---|---|
| Google Mobile Ads (AdMob) v9+ incl. UMP consent | OpenUPM package `com.google.ads.mobile`, or the .unitypackage plus scripting define `MOBILEFPS_ADMOB` | `Integrations/AdMob` |
| Unity IAP 4.8-4.x | Package Manager: `com.unity.purchasing` | `Integrations/UnityIAP` |
| Mobile Notifications 2.x | Package Manager: `com.unity.mobile.notifications` | `Integrations/Notifications` |

`AdsConfig` ships with **Google's public test ad unit ids**. Replace them before release.

---

## Mobile performance: what's built in

- Frame pacing: `targetFrameRate` (Android defaults to 30), optional
  90/120 Hz, and **OnDemandRendering** at half rate in menus.
- An adaptive resolution governor with hysteresis, plus a
  `PerformanceTierChangedEvent` that FX budgets react to.
- `Physics.autoSyncTransforms` off, reused collision callbacks, and a capped
  `maximumDeltaTime`.
- Zero GC in combat paths (struct events, pooled FX, `RaycastNonAlloc`
  with sorting, number-string tables in the HUD).
- Frame-rate-independent smoothing everywhere (exponential and closed-form
  springs).
- Health components disable themselves at full health (no `Update`). Muzzle
  flashes are toggled, never spawned. No dynamic lights by default.
- UI is written only when a value changes, uses nested canvases for dynamic
  elements, and never raycasts.
- Crash-safe saves (atomic replace plus backup) written off the main thread,
  with a synchronous save on pause.

---

## Verification

`Tools/HeadlessVerify/verify.sh` (needs only the .NET 8 SDK; it pulls Unity
reference assemblies from NuGet):

1. Compiles **all nine assemblies** (Core, Gameplay, Meta, UI, Editor, three SDK
   integrations, EditMode tests) against Unity 2021.3 reference assemblies,
   with obsolete-API warnings treated as errors.
2. Runs the **108 EditMode tests** on .NET through NUnitLite with a small managed
   `UnityEngine` shim. The same tests run in Unity's Test Runner
   (`Assets/MobileFPS/Tests/EditMode`).

What the tests cover: spring stability and frame-rate independence, EventBus
re-entrancy, ray/capsule math, deterministic spread, packet round-trip
(measured worst direction error 0.004°), lag-compensation rewind and
interpolation, every validator rejection path, penetration and pellet
aggregation, weapon stats, TTK, recoil patterns, wallet, progression, battle
pass, daily streak edge cases, challenges, match rewards, IAP idempotency, ad
caps, the shop, and notification planning.

**Limits:**
- UGUI and the three SDK APIs were checked against hand-written signature
  stubs, not the real packages (the SDK adapters are the most likely place for
  a first-compile fix).
- The scene builder and content generator were compile-checked but never
  executed.
- No device profiling has been done.

---

## Before shipping (checklist)

- [ ] **Make the economy server-authoritative.** Wallet, entitlements,
      battle pass and purchases are local caches here, with every mutation
      behind a service. Move those services to your backend.
- [ ] **Validate receipts server-side** (Play Developer API) and plug in an
      `IReceiptValidator`. Use AdMob **SSV** for ad rewards with real value.
- [ ] **Use server time**: swap `DeviceTimeProvider` for
      `ServerSyncedTimeProvider` in `MetaGame`.
- [ ] **Netcode**: implement `IShotTransport`, feed `NetworkClock`
      (clock sync + interpolation delay), call `CombatAuthority.ServerHandleShot`
      on the server, and record history there. Server-side ADS-state tracking
      should feed the spread check.
- [ ] Bots or matchmaking, real art (URP mobile pipeline asset, characters
      with `Hitbox` components, weapon models with `WeaponView`), audio.
- [ ] Play Console: product ids matching `StoreCatalog`, a privacy policy,
      the Data Safety form, the UMP consent message, an age rating (a
      realistic shooter is typically Teen / PEGI 16), and a target API level
      that meets the current requirement.
- [ ] Replace the test ad unit ids. Set the package name, signing keystore and
      icons. Enable **Optimized Frame Pacing** in Player Settings.
- [ ] Policy: cosmetics never affect stats (as built). If you add randomized
      paid items (crates), Google Play requires disclosing the odds.

---

## Layout

```
MobileFPS/
  Assets/MobileFPS/
    Core/          EventBus, Singleton, StaticReset, pooling, springs, time, save, perf, haptics
    Gameplay/
      Controls/    touch/desktop input, buttons, joystick view, safe area
      Player/      motor, camera, sway, aim assist, FPSPlayer, feedback
      Weapons/     definitions, stats, controller, inventory, hitscan, projectiles, view
      Combat/      hitboxes, rigs, health, damage, hit queries
      Networking/  shot packets, clock, lag-comp history, validator, CombatAuthority
      Effects/     surfaces, impact FX, tracers, muzzle flash
      Match/       match rules, spawns, practice targets
    Meta/          profile, economy, ads, IAP, shop, progression, battle pass, dailies, challenges, analytics
    UI/            HUD, debug panel
    Editor/        scene builder, content generator, Android settings, weapon TTK inspector
    Integrations/  AdMob, Unity IAP, Mobile Notifications adapters
    Tests/EditMode/
  Tools/HeadlessVerify/   compile + test without Unity
```
