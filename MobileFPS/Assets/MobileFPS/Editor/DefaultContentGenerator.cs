using System;
using System.Collections.Generic;
using MobileFPS.Core;
using MobileFPS.Controls;
using MobileFPS.Economy;
using MobileFPS.Effects;
using MobileFPS.LiveOps;
using MobileFPS.Monetization;
using MobileFPS.Player;
using MobileFPS.Progression;
using MobileFPS.Weapons;
using UnityEditor;
using UnityEngine;
using static MobileFPS.EditorTools.EditorAssetUtility;

namespace MobileFPS.EditorTools
{
    /// <summary>All generated content, returned so the scene builder can wire it.</summary>
    internal sealed class GeneratedContent
    {
        public WeaponDatabase Database;
        public List<WeaponDefinition> Weapons = new List<WeaponDefinition>();
        public MovementSettings Movement;
        public CameraSettings Camera;
        public TouchControlsSettings Touch;
        public AimAssistSettings AimAssist;
        public ImpactEffectLibrary Impacts;
        public ProgressionConfig Progression;
        public MatchRewardConfig MatchRewards;
        public BattlePassSeasonDefinition Season;
        public DailyRewardCalendar DailyCalendar;
        public ChallengePool Challenges;
        public StoreCatalog Store;
        public AdsConfig Ads;
    }

    /// <summary>
    /// Generates a complete, balanced starter content set: six weapons with
    /// distinct roles, recoil patterns, attachments, cosmetic skins, impact FX,
    /// player tuning, and every meta config (battle pass, daily calendar,
    /// challenges, store catalog, ads). Idempotent: existing assets are kept,
    /// so designer edits survive re-running it.
    /// </summary>
    internal static class DefaultContentGenerator
    {
        private const string Weapons = GeneratedRoot + "/Weapons";
        private const string Meta = GeneratedRoot + "/Meta";

        [MenuItem("MobileFPS/Setup/Generate Default Content", priority = 10)]
        private static void GenerateMenu()
        {
            Generate();
            EditorUtility.DisplayDialog("MobileFPS", $"Default content generated under {GeneratedRoot}.", "OK");
        }

        public static GeneratedContent Generate()
        {
            // No AssetDatabase.StartAssetEditing batching here: prefabs saved inside an
            // editing batch aren't importable until it ends, and ~60 assets are quick anyway.
            var content = new GeneratedContent();
            CreatePlayerSettings(content);
            content.Impacts = CreateImpactLibrary();
            CreateWeapons(content);
            CreateMeta(content);
            LoadOrCreate<MobilePerformanceSettings>($"{ResourcesRoot}/MobilePerformanceSettings.asset", null);
            AttachViewModels(content);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            return content;
        }

        private static void CreatePlayerSettings(GeneratedContent content)
        {
            content.Movement = LoadOrCreate<MovementSettings>($"{GeneratedRoot}/Player/MovementSettings.asset", null);
            content.Camera = LoadOrCreate<CameraSettings>($"{GeneratedRoot}/Player/CameraSettings.asset", null);
            content.Touch = LoadOrCreate<TouchControlsSettings>($"{GeneratedRoot}/Player/TouchControlsSettings.asset", null);
            content.AimAssist = LoadOrCreate<AimAssistSettings>($"{GeneratedRoot}/Player/AimAssistSettings.asset", a =>
            {
                a.occlusionMask = MobileFPS.Networking.CombatAuthority.DefaultWorldMask();
            });
        }

        // ------------------------------------------------------------------
        // Weapons
        // ------------------------------------------------------------------

        private static void CreateWeapons(GeneratedContent content)
        {
            RecoilPattern arPattern = Pattern("Recoil_AR", 30, 1.0f, 0.35f, 11u, 0.6f);
            RecoilPattern smgPattern = Pattern("Recoil_SMG", 32, 0.75f, 0.5f, 23u, 0.7f);
            RecoilPattern sniperPattern = Pattern("Recoil_Sniper", 1, 4.0f, 0.3f, 37u, 1f);
            RecoilPattern shotgunPattern = Pattern("Recoil_Shotgun", 1, 3.2f, 0.6f, 41u, 1f);
            RecoilPattern pistolPattern = Pattern("Recoil_Pistol", 12, 1.6f, 0.4f, 53u, 0.8f);

            content.Weapons.Add(Weapon("weapon_ar_vanguard", "Vanguard AR", WeaponClass.AssaultRifle, w =>
            {
                w.fireMode = FireMode.FullAuto;
                w.roundsPerMinute = 750f;
                w.damageRanges = new[] { new DamageRange(25f, 26f), new DamageRange(45f, 22f), new DamageRange(150f, 18f) };
                w.maxRange = 150f;
                w.penetrationPower = 1f;
                w.longshotDistance = 40f;
                w.ammo = new AmmoSettings { magazineSize = 30, startingReserve = 150, maxReserve = 240 };
                w.handling = new HandlingSettings { adsTime = 0.24f, adsFovMultiplier = 0.8f, moveSpeedMultiplier = 0.97f, adsMoveSpeedMultiplier = 0.55f, sprintToFireTime = 0.2f, tacticalReloadTime = 1.9f, emptyReloadTime = 2.5f };
                w.spread = new SpreadSettings { hipMin = 2.0f, hipMax = 6f, perShot = 0.45f, ads = 0.08f };
                w.recoil = new RecoilSettings { pattern = arPattern, scale = 1f, permanentFraction = 0.35f };
            }));

            content.Weapons.Add(Weapon("weapon_smg_viper", "Viper SMG", WeaponClass.SubmachineGun, w =>
            {
                w.fireMode = FireMode.FullAuto;
                w.roundsPerMinute = 900f;
                w.damageRanges = new[] { new DamageRange(10f, 27f), new DamageRange(20f, 21f), new DamageRange(80f, 16f) };
                w.zoneMultipliers = new HitZoneMultipliers { head = 1.25f, upperTorso = 1.05f };
                w.maxRange = 80f;
                w.penetrationPower = 0.6f;
                w.longshotDistance = 25f;
                w.ammo = new AmmoSettings { magazineSize = 32, startingReserve = 160, maxReserve = 256 };
                w.handling = new HandlingSettings { adsTime = 0.18f, adsFovMultiplier = 0.86f, moveSpeedMultiplier = 1f, adsMoveSpeedMultiplier = 0.7f, sprintToFireTime = 0.13f, tacticalReloadTime = 1.7f, emptyReloadTime = 2.2f };
                w.spread = new SpreadSettings { hipMin = 1.4f, hipMax = 4.5f, perShot = 0.3f, ads = 0.25f, movePenalty = 0.8f };
                w.recoil = new RecoilSettings { pattern = smgPattern, scale = 1f, permanentFraction = 0.3f, viewKickBack = 0.02f };
            }));

            content.Weapons.Add(Weapon("weapon_sniper_longbow", "Longbow Sniper", WeaponClass.SniperRifle, w =>
            {
                w.fireMode = FireMode.SemiAuto;
                w.roundsPerMinute = 50f;
                w.damageRanges = new[] { new DamageRange(150f, 95f), new DamageRange(300f, 85f) };
                w.zoneMultipliers = new HitZoneMultipliers { head = 2f, upperTorso = 1.1f, lowerTorso = 1f, arm = 0.85f, leg = 0.8f };
                w.maxRange = 300f;
                w.penetrationPower = 2.5f;
                w.longshotDistance = 60f;
                w.ammo = new AmmoSettings { magazineSize = 5, startingReserve = 25, maxReserve = 40 };
                w.handling = new HandlingSettings { adsTime = 0.42f, adsFovMultiplier = 0.3f, adsSensitivityMultiplier = 0.55f, moveSpeedMultiplier = 0.9f, adsMoveSpeedMultiplier = 0.4f, sprintToFireTime = 0.35f, tacticalReloadTime = 2.6f, emptyReloadTime = 3.2f };
                w.spread = new SpreadSettings { hipMin = 6f, hipMax = 10f, perShot = 2f, ads = 0f, movePenalty = 3f };
                w.recoil = new RecoilSettings { pattern = sniperPattern, scale = 1f, permanentFraction = 0.15f, viewKickBack = 0.08f, viewKickUpDegrees = 8f, cameraPunchDegrees = 3f, traumaPerShot = 0.1f };
                w.presentation = new WeaponPresentation { tracerEveryNthRound = 1 };
            }));

            content.Weapons.Add(Weapon("weapon_shotgun_breacher", "Breacher Shotgun", WeaponClass.Shotgun, w =>
            {
                w.fireMode = FireMode.SemiAuto;
                w.roundsPerMinute = 80f;
                w.pelletsPerShot = 8;
                w.damageRanges = new[] { new DamageRange(6f, 20f), new DamageRange(12f, 12f), new DamageRange(25f, 5f) };
                w.zoneMultipliers = new HitZoneMultipliers { head = 1f, upperTorso = 1f, lowerTorso = 1f, arm = 1f, leg = 1f };
                w.maxRange = 25f;
                w.penetrationPower = 0.3f;
                w.longshotDistance = 12f;
                w.ammo = new AmmoSettings { magazineSize = 6, startingReserve = 30, maxReserve = 42 };
                w.handling = new HandlingSettings { adsTime = 0.25f, adsFovMultiplier = 0.9f, moveSpeedMultiplier = 1f, adsMoveSpeedMultiplier = 0.65f, sprintToFireTime = 0.15f, perRoundReload = true, perRoundReloadTime = 0.5f };
                w.spread = new SpreadSettings { hipMin = 4.5f, hipMax = 5f, perShot = 0f, ads = 3.2f, movePenalty = 0.5f };
                w.recoil = new RecoilSettings { pattern = shotgunPattern, scale = 1f, permanentFraction = 0.2f, viewKickBack = 0.07f, viewKickUpDegrees = 7f, cameraPunchDegrees = 3.5f, traumaPerShot = 0.12f };
                w.presentation = new WeaponPresentation { tracerEveryNthRound = 1 };
            }));

            content.Weapons.Add(Weapon("weapon_launcher_thumper", "Thumper Launcher", WeaponClass.Launcher, w =>
            {
                w.fireMode = FireMode.SemiAuto;
                w.roundsPerMinute = 60f;
                w.damageRanges = new[] { new DamageRange(200f, 60f) };
                w.maxRange = 200f;
                w.ammo = new AmmoSettings { magazineSize = 1, startingReserve = 6, maxReserve = 8 };
                w.handling = new HandlingSettings { adsTime = 0.35f, adsFovMultiplier = 0.85f, moveSpeedMultiplier = 0.92f, adsMoveSpeedMultiplier = 0.5f, sprintToFireTime = 0.3f, tacticalReloadTime = 2.4f, emptyReloadTime = 2.4f };
                w.spread = new SpreadSettings { hipMin = 0.8f, hipMax = 1.5f, perShot = 0f, ads = 0.1f };
                w.recoil = new RecoilSettings { pattern = shotgunPattern, scale = 1.3f, viewKickBack = 0.09f, cameraPunchDegrees = 4f, traumaPerShot = 0.15f };
                w.projectile = new ProjectileSettings { useProjectile = true, speed = 40f, gravityScale = 0.6f, radius = 0.08f, lifetime = 6f, explosionRadius = 4.5f, explosionDamage = 140f, armingDistance = 6f };
            }));

            content.Weapons.Add(Weapon("weapon_pistol_p9", "P9 Sidearm", WeaponClass.Pistol, w =>
            {
                w.fireMode = FireMode.SemiAuto;
                w.roundsPerMinute = 400f;
                w.damageRanges = new[] { new DamageRange(15f, 28f), new DamageRange(40f, 20f), new DamageRange(60f, 16f) };
                w.maxRange = 60f;
                w.penetrationPower = 0.4f;
                w.longshotDistance = 25f;
                w.ammo = new AmmoSettings { magazineSize = 12, startingReserve = 60, maxReserve = 96 };
                w.handling = new HandlingSettings { adsTime = 0.15f, adsFovMultiplier = 0.9f, moveSpeedMultiplier = 1.03f, adsMoveSpeedMultiplier = 0.8f, sprintToFireTime = 0.1f, equipTime = 0.3f, tacticalReloadTime = 1.4f, emptyReloadTime = 1.8f };
                w.spread = new SpreadSettings { hipMin = 1.5f, hipMax = 4f, perShot = 0.6f, ads = 0.15f };
                w.recoil = new RecoilSettings { pattern = pistolPattern, scale = 1f, permanentFraction = 0.25f };
            }));

            AttachmentDefinition[] attachments =
            {
                Attachment("muzzle_compensator", "Compensator", AttachmentSlot.Muzzle, 2, (WeaponStat.VerticalRecoil, -15f), (WeaponStat.AdsTime, 5f)),
                Attachment("barrel_long", "Long Barrel", AttachmentSlot.Barrel, 4, (WeaponStat.DamageRange, 20f), (WeaponStat.AdsTime, 8f), (WeaponStat.MoveSpeed, -2f)),
                Attachment("optic_red_dot", "Red Dot", AttachmentSlot.Optic, 3, (WeaponStat.AdsZoom, 10f), (WeaponStat.AdsTime, 3f)),
                Attachment("stock_light", "Light Stock", AttachmentSlot.Stock, 5, (WeaponStat.AdsTime, -10f), (WeaponStat.VerticalRecoil, 8f)),
                Attachment("underbarrel_grip", "Vertical Grip", AttachmentSlot.Underbarrel, 6, (WeaponStat.HorizontalRecoil, -20f), (WeaponStat.AdsTime, 4f)),
                Attachment("mag_extended", "Extended Mag", AttachmentSlot.Magazine, 8, (WeaponStat.MagazineSize, 40f), (WeaponStat.ReloadTime, 12f), (WeaponStat.AdsTime, 4f)),
                Attachment("grip_quickdraw", "Quickdraw Grip", AttachmentSlot.RearGrip, 10, (WeaponStat.AdsTime, -12f), (WeaponStat.HipSpread, 5f)),
                Attachment("laser_tactical", "Tactical Laser", AttachmentSlot.Laser, 12, (WeaponStat.HipSpread, -20f), (WeaponStat.SprintToFireTime, -10f)),
            };

            // Skins: ids match the rewards referenced by the battle pass, daily calendar and store.
            WeaponSkinDefinition[] skins =
            {
                Skin("skin_ar_starter_camo", "Starter Camo", "weapon_ar_vanguard", CosmeticRarity.Uncommon, new Color(0.35f, 0.4f, 0.25f)),
                Skin("skin_ar_starter_elite", "Elite Black", "weapon_ar_vanguard", CosmeticRarity.Epic, new Color(0.08f, 0.08f, 0.1f)),
                Skin("skin_ar_season01_operator", "S1 Operator", "weapon_ar_vanguard", CosmeticRarity.Rare, new Color(0.2f, 0.3f, 0.22f)),
                Skin("skin_ar_season01_mythic", "S1 Mythic Prism", "weapon_ar_vanguard", CosmeticRarity.Mythic, new Color(0.2f, 0.9f, 1f)),
                Skin("skin_smg_season01_neon", "S1 Neon", "weapon_smg_viper", CosmeticRarity.Epic, new Color(1f, 0.2f, 0.8f)),
                Skin("skin_smg_daily_streak", "Streak Blaze", "weapon_smg_viper", CosmeticRarity.Rare, new Color(1f, 0.5f, 0.1f)),
                Skin("skin_sniper_season01_gold", "S1 Gold", "weapon_sniper_longbow", CosmeticRarity.Legendary, new Color(1f, 0.8f, 0.25f)),
            };

            content.Database = LoadOrCreate<WeaponDatabase>($"{Weapons}/WeaponDatabase.asset", db =>
            {
                db.weapons = content.Weapons.ToArray();
                db.attachments = attachments;
                db.skins = skins;
            });
        }

        private static WeaponDefinition Weapon(string id, string displayName, WeaponClass weaponClass, Action<WeaponDefinition> configure)
        {
            return LoadOrCreate<WeaponDefinition>($"{Weapons}/{id}.asset", w =>
            {
                w.weaponId = id;
                w.displayName = displayName;
                w.weaponClass = weaponClass;
                configure(w);
            });
        }

        private static RecoilPattern Pattern(string name, int shots, float vertical, float drift, uint seed, float firstShot)
        {
            return LoadOrCreate<RecoilPattern>($"{Weapons}/Recoil/{name}.asset", p =>
            {
                p.kicks = RecoilPattern.GenerateClimb(shots, vertical, drift, seed);
                p.firstShotMultiplier = firstShot;
                p.loopFromIndex = shots > 8 ? shots / 2 : -1;
            });
        }

        private static AttachmentDefinition Attachment(string id, string displayName, AttachmentSlot slot, int unlockLevel,
            params (WeaponStat stat, float percent)[] modifiers)
        {
            return LoadOrCreate<AttachmentDefinition>($"{Weapons}/Attachments/{id}.asset", a =>
            {
                a.attachmentId = id;
                a.displayName = displayName;
                a.slot = slot;
                a.unlockWeaponLevel = unlockLevel;
                a.modifiers = Array.ConvertAll(modifiers, m => new StatModifier(m.stat, m.percent));
            });
        }

        private static WeaponSkinDefinition Skin(string id, string displayName, string weaponId, CosmeticRarity rarity, Color color)
        {
            Material material = LitMaterial($"Skin_{id}", color);
            return LoadOrCreate<WeaponSkinDefinition>($"{Weapons}/Skins/{id}.asset", s =>
            {
                s.skinId = id;
                s.displayName = displayName;
                s.weaponId = weaponId;
                s.rarity = rarity;
                s.materials = new[] { material };
                s.tracerColor = Color.Lerp(color, Color.white, 0.4f);
            });
        }

        // ------------------------------------------------------------------
        // Viewmodels (primitive placeholder guns: swap for real art later)
        // ------------------------------------------------------------------

        private static void AttachViewModels(GeneratedContent content)
        {
            Material gunMetal = LitMaterial("GunMetal", new Color(0.18f, 0.19f, 0.21f));
            Material accent = LitMaterial("GunAccent", new Color(0.55f, 0.45f, 0.3f));
            Material flash = LitMaterial("MuzzleFlash", new Color(1f, 0.8f, 0.35f));

            foreach (WeaponDefinition weapon in content.Weapons)
            {
                if (weapon.presentation.viewModelPrefab != null) continue;
                float length = weapon.weaponClass == WeaponClass.SniperRifle ? 0.75f
                    : weapon.weaponClass == WeaponClass.Pistol ? 0.22f
                    : weapon.weaponClass == WeaponClass.SubmachineGun ? 0.38f
                    : weapon.weaponClass == WeaponClass.Launcher ? 0.6f : 0.55f;
                GameObject prefab = BuildViewModel(weapon.weaponId, length, weapon.weaponClass == WeaponClass.Launcher ? 0.09f : 0.045f, gunMetal, accent, flash);
                weapon.presentation.viewModelPrefab = prefab;
                if (weapon.projectile.useProjectile && weapon.projectile.visualPrefab == null)
                {
                    weapon.projectile.visualPrefab = BuildProjectileVisual(accent);
                }
                EditorUtility.SetDirty(weapon);
            }
        }

        private static GameObject BuildViewModel(string id, float length, float thickness, Material body, Material accent, Material flashMaterial)
        {
            string path = $"{Weapons}/ViewModels/VM_{id}.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (existing != null) return existing;

            int layer = LayerMask.NameToLayer("Viewmodel");
            var root = new GameObject($"VM_{id}");
            var renderers = new List<Renderer>();

            Transform Part(string name, PrimitiveType type, Vector3 position, Vector3 scale, Material material)
            {
                GameObject part = GameObject.CreatePrimitive(type);
                part.name = name;
                UnityEngine.Object.DestroyImmediate(part.GetComponent<Collider>()); // viewmodels never collide
                part.transform.SetParent(root.transform, false);
                part.transform.localPosition = position;
                part.transform.localScale = scale;
                var renderer = part.GetComponent<MeshRenderer>();
                renderer.sharedMaterial = material;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                renderers.Add(renderer);
                return part.transform;
            }

            Part("Body", PrimitiveType.Cube, new Vector3(0f, 0f, length * 0.5f), new Vector3(thickness * 1.6f, thickness * 2.2f, length), body);
            Part("Grip", PrimitiveType.Cube, new Vector3(0f, -thickness * 2f, length * 0.25f), new Vector3(thickness * 1.2f, thickness * 3f, thickness * 1.6f), accent);
            Part("Sight", PrimitiveType.Cube, new Vector3(0f, thickness * 1.6f, length * 0.4f), new Vector3(thickness * 0.8f, thickness, thickness * 2f), body);

            var muzzle = new GameObject("Muzzle").transform;
            muzzle.SetParent(root.transform, false);
            muzzle.localPosition = new Vector3(0f, 0f, length + 0.01f);

            var sightAnchor = new GameObject("SightAnchor").transform;
            sightAnchor.SetParent(root.transform, false);
            sightAnchor.localPosition = new Vector3(0f, thickness * 2.3f, length * 0.4f);

            Transform flash = Part("FlashVisual", PrimitiveType.Quad, Vector3.zero, Vector3.one * 0.12f, flashMaterial);
            flash.SetParent(muzzle, false);
            flash.localPosition = Vector3.zero;
            renderers.Remove(flash.GetComponent<Renderer>()); // flash keeps its own material under skins

            var muzzleFlash = muzzle.gameObject.AddComponent<MuzzleFlash>();
            Set(muzzleFlash, "flashVisual", flash.gameObject);

            var audio = root.AddComponent<AudioSource>();
            audio.playOnAwake = false;
            audio.spatialBlend = 0f;
            audio.priority = 32; // gunfire beats ambience when voices run out

            var view = root.AddComponent<WeaponView>();
            Set(view, "muzzle", muzzle);
            Set(view, "sightAnchor", sightAnchor);
            Set(view, "muzzleFlash", muzzleFlash);
            Set(view, "audioSource", audio);
            SetArray(view, "skinnableRenderers", renderers.ToArray());

            if (layer >= 0) SetLayerRecursively(root, layer);
            return SavePrefab(root, path);
        }

        private static GameObject BuildProjectileVisual(Material material)
        {
            string path = $"{Weapons}/ViewModels/Projectile_Grenade.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (existing != null) return existing;

            GameObject root = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            root.name = "Projectile_Grenade";
            UnityEngine.Object.DestroyImmediate(root.GetComponent<Collider>()); // ProjectileSystem does its own sweeps
            root.transform.localScale = Vector3.one * 0.12f;
            root.GetComponent<MeshRenderer>().sharedMaterial = material;
            int layer = LayerMask.NameToLayer("Projectile");
            if (layer >= 0) root.layer = layer;
            return SavePrefab(root, path);
        }

        private static void SetLayerRecursively(GameObject go, int layer)
        {
            go.layer = layer;
            foreach (Transform child in go.transform) SetLayerRecursively(child.gameObject, layer);
        }

        // ------------------------------------------------------------------
        // Impact FX
        // ------------------------------------------------------------------

        private static ImpactEffectLibrary CreateImpactLibrary()
        {
            return LoadOrCreate<ImpactEffectLibrary>($"{GeneratedRoot}/Effects/ImpactEffectLibrary.asset", library =>
            {
                library.defaultEntry = new ImpactEffectLibrary.Entry
                {
                    surface = SurfaceType.Default,
                    effectPrefab = BuildImpactParticles("FX_Impact_Dust", new Color(0.75f, 0.7f, 0.6f), 10, 2.5f),
                    decalPrefab = BuildDecal(),
                };
                library.entries = new[]
                {
                    new ImpactEffectLibrary.Entry { surface = SurfaceType.Metal, effectPrefab = BuildImpactParticles("FX_Impact_Sparks", new Color(1f, 0.75f, 0.3f), 14, 6f) },
                    new ImpactEffectLibrary.Entry { surface = SurfaceType.Wood, effectPrefab = BuildImpactParticles("FX_Impact_Splinters", new Color(0.55f, 0.38f, 0.2f), 10, 3f) },
                    new ImpactEffectLibrary.Entry { surface = SurfaceType.Flesh, effectPrefab = BuildImpactParticles("FX_Impact_Hit", new Color(0.75f, 0.08f, 0.08f), 12, 2f) },
                };
            });
        }

        private static GameObject BuildImpactParticles(string name, Color color, int count, float speed)
        {
            string path = $"{GeneratedRoot}/Effects/{name}.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (existing != null) return existing;

            var root = new GameObject(name);
            var particles = root.AddComponent<ParticleSystem>();
            ParticleSystem.MainModule main = particles.main;
            main.duration = 0.3f;
            main.loop = false;
            main.playOnAwake = true;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.15f, 0.4f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(speed * 0.4f, speed);
            main.startSize = new ParticleSystem.MinMaxCurve(0.02f, 0.06f);
            main.startColor = color;
            main.gravityModifier = 1f;
            main.maxParticles = count * 2;
            main.stopAction = ParticleSystemStopAction.None; // the pool owns the lifetime

            ParticleSystem.EmissionModule emission = particles.emission;
            emission.rateOverTime = 0f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, (short)count) });

            ParticleSystem.ShapeModule shape = particles.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 35f;
            shape.radius = 0.02f;

            var renderer = root.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = ParticleMaterial();
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;

            root.AddComponent<PooledParticleEffect>();
            return SavePrefab(root, path);
        }

        private static GameObject BuildDecal()
        {
            string path = $"{GeneratedRoot}/Effects/FX_BulletHole.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (existing != null) return existing;

            GameObject decal = GameObject.CreatePrimitive(PrimitiveType.Quad);
            decal.name = "Quad";
            UnityEngine.Object.DestroyImmediate(decal.GetComponent<Collider>());
            decal.transform.localScale = Vector3.one * 0.07f;
            var renderer = decal.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = LitMaterial("BulletHole", new Color(0.05f, 0.05f, 0.05f));
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            // A quad faces -Z; the system orients decals with LookRotation(normal), so
            // flip the mesh to face along +Z (out of the surface).
            var root = new GameObject("FX_BulletHole");
            decal.transform.SetParent(root.transform, false);
            decal.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
            return SavePrefab(root, path);
        }

        // ------------------------------------------------------------------
        // Meta configs
        // ------------------------------------------------------------------

        private static void CreateMeta(GeneratedContent content)
        {
            content.Progression = LoadOrCreate<ProgressionConfig>($"{Meta}/ProgressionConfig.asset", null);
            content.MatchRewards = LoadOrCreate<MatchRewardConfig>($"{Meta}/MatchRewardConfig.asset", null);
            content.DailyCalendar = LoadOrCreate<DailyRewardCalendar>($"{Meta}/DailyRewardCalendar.asset", null);
            content.Season = LoadOrCreate<BattlePassSeasonDefinition>($"{Meta}/BattlePass_Season01.asset", season =>
            {
                DateTime today = DateTime.UtcNow.Date;
                season.seasonId = "season_01";
                season.displayName = "Season 1: Ignition";
                season.SetWindow(today, today.AddDays(60));
            });

            content.Challenges = LoadOrCreate<ChallengePool>($"{Meta}/ChallengePool.asset", pool =>
            {
                ChallengePool defaults = ChallengePool.CreateDefault();
                var saved = new List<ChallengeDefinition>();
                foreach (ChallengeDefinition template in defaults.challenges)
                {
                    saved.Add(LoadOrCreate<ChallengeDefinition>($"{Meta}/Challenges/{template.challengeId}.asset", c => EditorUtility.CopySerialized(template, c)));
                }
                pool.challenges = saved.ToArray();
            });

            content.Store = LoadOrCreate<StoreCatalog>($"{ResourcesRoot}/StoreCatalog.asset", catalog =>
            {
                StoreCatalog defaults = StoreCatalog.CreateDefault();
                var saved = new List<StoreProductDefinition>();
                foreach (StoreProductDefinition template in defaults.products)
                {
                    saved.Add(LoadOrCreate<StoreProductDefinition>($"{Meta}/Store/{template.productId}.asset", p => EditorUtility.CopySerialized(template, p)));
                }
                catalog.products = saved.ToArray();
            });

            content.Ads = LoadOrCreate<AdsConfig>($"{ResourcesRoot}/AdsConfig.asset", null);

            LoadOrCreate<ShopItemDefinition>($"{Meta}/Shop/offer_skin_ar_elite.asset", offer =>
            {
                offer.offerId = "offer_skin_ar_elite";
                offer.displayName = "Elite Black (AR)";
                offer.currency = CurrencyType.Gems;
                offer.price = 800;
                offer.originalPrice = 1200;
                offer.contents = RewardBundle.Of(RewardItem.Item("skin_ar_starter_elite"));
            });
        }
    }
}
