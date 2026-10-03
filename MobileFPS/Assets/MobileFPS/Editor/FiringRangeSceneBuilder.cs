using System.Collections.Generic;
using System.Linq;
using MobileFPS.Combat;
using MobileFPS.Controls;
using MobileFPS.Core;
using MobileFPS.Effects;
using MobileFPS.Match;
using MobileFPS.Meta;
using MobileFPS.Monetization;
using MobileFPS.Networking;
using MobileFPS.Player;
using MobileFPS.UI;
using MobileFPS.Weapons;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using static MobileFPS.EditorTools.EditorAssetUtility;

namespace MobileFPS.EditorTools
{
    /// <summary>
    /// One click from an empty project to a playable firing range: generated
    /// content, a primitive test map (penetrable wood, metal wall, slide ramp,
    /// distance markers), static and strafing targets at 10-80 m, the full player
    /// rig, a touch HUD, and every system (meta, ads, IAP, match, hit authority).
    /// Press Play: mouse/keyboard in the Editor, touch on device.
    /// </summary>
    internal static class FiringRangeSceneBuilder
    {
        private const string ScenePath = "Assets/MobileFPS/Scenes/FiringRange.unity";

        [MenuItem("MobileFPS/Create Firing Range Scene", priority = 0)]
        private static void Build()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            GeneratedContent content = DefaultContentGenerator.Generate();
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            int worldMask = CombatAuthority.DefaultWorldMask();
            BuildLighting();
            BuildWorld();
            BuildTargets();
            FPSPlayer player = BuildPlayer(content, worldMask, out TouchInputSource touch);
            MatchController match = BuildSystems(content, player, worldMask);
            BuildHud(player, match, touch);

            EnsureFolder("Assets/MobileFPS/Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);
            AddToBuildSettings(ScenePath);
            Selection.activeGameObject = player.gameObject;
            Debug.Log("[MobileFPS] Firing range created. Press Play: WASD/mouse, Shift sprint, C slide/crouch, Space jump, RMB aim, R reload, Q switch. 'META' (top right) opens the monetization test panel.");
        }

        // ------------------------------------------------------------------
        // World
        // ------------------------------------------------------------------

        private static void BuildLighting()
        {
            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.15f;
            sun.shadows = LightShadows.Hard; // soft shadows cost extra samples on mobile GPUs
            sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.55f, 0.6f, 0.7f);
            RenderSettings.ambientEquatorColor = new Color(0.4f, 0.4f, 0.42f);
            RenderSettings.ambientGroundColor = new Color(0.2f, 0.2f, 0.2f);
        }

        private static void BuildWorld()
        {
            var root = new GameObject("World").transform;
            Material concrete = LitMaterial("Concrete", new Color(0.55f, 0.55f, 0.53f));
            Material wood = LitMaterial("Wood", new Color(0.55f, 0.38f, 0.22f));
            Material metal = LitMaterial("Metal", new Color(0.35f, 0.38f, 0.42f));
            Material marker = LitMaterial("Marker", new Color(0.95f, 0.75f, 0.1f));

            Block(root, "Ground", new Vector3(0f, -0.5f, 40f), new Vector3(60f, 1f, 140f), concrete, SurfaceType.Concrete);
            Block(root, "Wall_Left", new Vector3(-30f, 3f, 40f), new Vector3(1f, 6f, 140f), concrete, SurfaceType.Concrete);
            Block(root, "Wall_Right", new Vector3(30f, 3f, 40f), new Vector3(1f, 6f, 140f), concrete, SurfaceType.Concrete);
            Block(root, "Backstop", new Vector3(0f, 6f, 110f), new Vector3(60f, 12f, 1f), concrete, SurfaceType.Concrete);

            // Penetration test: wood crates (most guns shoot through) and a thin metal wall
            // (only the sniper's penetration budget beats it).
            Block(root, "Crate_A", new Vector3(-4f, 0.6f, 14f), new Vector3(1.2f, 1.2f, 1.2f), wood, SurfaceType.Wood);
            Block(root, "Crate_B", new Vector3(4.5f, 0.6f, 19f), new Vector3(1.2f, 1.2f, 1.2f), wood, SurfaceType.Wood);
            Block(root, "Crate_Stack", new Vector3(-9f, 1.2f, 30f), new Vector3(1.2f, 2.4f, 1.2f), wood, SurfaceType.Wood);
            Block(root, "MetalWall", new Vector3(9f, 1.25f, 35f), new Vector3(4f, 2.5f, 0.15f), metal, SurfaceType.Metal);

            // Slide ramp: slides accelerate downhill (see FPSCharacterMotor.UpdateSlide).
            Transform ramp = Block(root, "SlideRamp", new Vector3(-18f, 1.2f, 20f), new Vector3(5f, 0.3f, 12f), concrete, SurfaceType.Concrete);
            ramp.rotation = Quaternion.Euler(-12f, 0f, 0f);
            Block(root, "RampTop", new Vector3(-18f, 1.25f, 29f), new Vector3(5f, 2.5f, 6f), concrete, SurfaceType.Concrete);

            foreach (float distance in new[] { 10f, 25f, 50f, 80f })
            {
                Transform line = Block(root, $"Marker_{distance}m", new Vector3(0f, 0.01f, distance), new Vector3(20f, 0.02f, 0.15f), marker, SurfaceType.Concrete);
                Object.DestroyImmediate(line.GetComponent<Collider>()); // visual only
            }
        }

        private static Transform Block(Transform parent, string name, Vector3 position, Vector3 scale, Material material, SurfaceType surface)
        {
            GameObject block = GameObject.CreatePrimitive(PrimitiveType.Cube);
            block.name = name;
            block.isStatic = true; // static batching: one of the cheapest draw-call wins on mobile
            block.transform.SetParent(parent, false);
            block.transform.position = position;
            block.transform.localScale = scale;
            block.GetComponent<MeshRenderer>().sharedMaterial = material;
            block.AddComponent<SurfaceIdentifier>().surface = surface;
            return block.transform;
        }

        // ------------------------------------------------------------------
        // Targets
        // ------------------------------------------------------------------

        private static void BuildTargets()
        {
            var root = new GameObject("Targets").transform;
            Material body = LitMaterial("TargetBody", new Color(0.8f, 0.25f, 0.2f));
            Material head = LitMaterial("TargetHead", new Color(0.95f, 0.85f, 0.75f));

            Target(root, "Target_10m", new Vector3(-3f, 0f, 10f), false, body, head);
            Target(root, "Target_25m", new Vector3(3f, 0f, 25f), false, body, head);
            Target(root, "Target_50m", new Vector3(0f, 0f, 50f), false, body, head);
            Target(root, "Strafer_15m", new Vector3(0f, 0f, 15f), true, body, head);
            Target(root, "Strafer_32m", new Vector3(-6f, 0f, 32f), true, body, head);
            Target(root, "Target_80m", new Vector3(5f, 0f, 80f), false, body, head);
            Target(root, "BehindCrate", new Vector3(4.5f, 0f, 20.5f), false, body, head);
            Target(root, "BehindMetal", new Vector3(9f, 0f, 36.5f), false, body, head);
        }

        private static void Target(Transform parent, string name, Vector3 position, bool strafe, Material bodyMaterial, Material headMaterial)
        {
            var root = new GameObject(name);
            root.transform.SetParent(parent, false);
            root.transform.position = position;
            root.transform.rotation = Quaternion.Euler(0f, 180f, 0f); // face the shooter

            Visual(root.transform, PrimitiveType.Capsule, new Vector3(0f, 0.9f, 0f), new Vector3(0.55f, 0.9f, 0.4f), bodyMaterial);
            Visual(root.transform, PrimitiveType.Sphere, new Vector3(0f, 1.62f, 0f), Vector3.one * 0.27f, headMaterial);

            HitboxPart(root.transform, "Head", HitZone.Head, HitboxShape.Sphere, new Vector3(0f, 1.62f, 0f), 0f, 0.14f);
            Transform chest = HitboxPart(root.transform, "UpperTorso", HitZone.UpperTorso, HitboxShape.Capsule, new Vector3(0f, 1.3f, 0f), 0.55f, 0.24f);
            HitboxPart(root.transform, "LowerTorso", HitZone.LowerTorso, HitboxShape.Capsule, new Vector3(0f, 0.98f, 0f), 0.4f, 0.22f);
            HitboxPart(root.transform, "ArmL", HitZone.Arm, HitboxShape.Capsule, new Vector3(-0.3f, 1.2f, 0f), 0.6f, 0.07f);
            HitboxPart(root.transform, "ArmR", HitZone.Arm, HitboxShape.Capsule, new Vector3(0.3f, 1.2f, 0f), 0.6f, 0.07f);
            HitboxPart(root.transform, "LegL", HitZone.Leg, HitboxShape.Capsule, new Vector3(-0.11f, 0.45f, 0f), 0.9f, 0.1f);
            HitboxPart(root.transform, "LegR", HitZone.Leg, HitboxShape.Capsule, new Vector3(0.11f, 0.45f, 0f), 0.9f, 0.1f);

            root.AddComponent<Health>();
            var entity = root.AddComponent<CombatEntity>();
            SetEnum(entity, "team", (int)TeamId.Bravo);
            Set(entity, "displayName", name);
            Set(entity, "isBot", true);

            var rig = root.AddComponent<HitboxRig>();
            Set(rig, "aimPoint", chest);
            Set(rig, "headPoint", root.transform.Find("Head"));

            var practice = root.AddComponent<PracticeTarget>();
            Set(practice, "strafe", strafe);
            Set(practice, "strafeOffset", new Vector3(3.5f, 0f, 0f));
        }

        private static void Visual(Transform parent, PrimitiveType type, Vector3 position, Vector3 scale, Material material)
        {
            GameObject visual = GameObject.CreatePrimitive(type);
            // Targets are hit through analytic hitboxes only; a collider here would
            // count as world geometry and block bullets.
            Object.DestroyImmediate(visual.GetComponent<Collider>());
            visual.transform.SetParent(parent, false);
            visual.transform.localPosition = position;
            visual.transform.localScale = scale;
            visual.GetComponent<MeshRenderer>().sharedMaterial = material;
        }

        private static Transform HitboxPart(Transform parent, string name, HitZone zone, HitboxShape shape, Vector3 position, float height, float radius)
        {
            var part = new GameObject(name).transform;
            part.SetParent(parent, false);
            part.localPosition = position;
            part.gameObject.AddComponent<Hitbox>().Configure(zone, shape, Vector3.zero, Vector3.up, height, radius);
            return part;
        }

        // ------------------------------------------------------------------
        // Player
        // ------------------------------------------------------------------

        private static FPSPlayer BuildPlayer(GeneratedContent content, int worldMask, out TouchInputSource touch)
        {
            var go = new GameObject("Player");
            int playerLayer = LayerMask.NameToLayer("Player");
            if (playerLayer >= 0) go.layer = playerLayer;

            var controller = go.AddComponent<CharacterController>();
            controller.height = 1.8f;
            controller.radius = 0.35f;
            controller.center = new Vector3(0f, 0.9f, 0f);
            controller.slopeLimit = 50f;
            controller.stepOffset = 0.4f;
            controller.skinWidth = 0.04f;
            controller.minMoveDistance = 0f;

            var motor = go.AddComponent<FPSCharacterMotor>();
            Set(motor, "settings", content.Movement);
            SetMask(motor, "environmentMask", worldMask);

            go.AddComponent<Health>();
            var entity = go.AddComponent<CombatEntity>();
            SetEnum(entity, "team", (int)TeamId.Alpha);
            Set(entity, "displayName", "You");
            Set(entity, "isLocalPlayer", true);

            // The local player has hitboxes too (bots/remote players shoot them).
            Transform chest = HitboxPart(go.transform, "Hitbox_Torso", HitZone.UpperTorso, HitboxShape.Capsule, new Vector3(0f, 1.15f, 0f), 0.9f, 0.25f);
            HitboxPart(go.transform, "Hitbox_Legs", HitZone.Leg, HitboxShape.Capsule, new Vector3(0f, 0.45f, 0f), 0.9f, 0.18f);
            Transform head = HitboxPart(go.transform, "Hitbox_Head", HitZone.Head, HitboxShape.Sphere, new Vector3(0f, 1.65f, 0f), 0f, 0.14f);
            var rig = go.AddComponent<HitboxRig>();
            Set(rig, "aimPoint", chest);
            Set(rig, "headPoint", head);

            // Camera rig: Player(yaw) > CameraPivot(pitch) > AimPivot(recoil) > Camera(cosmetic) > WeaponHolder(sway)
            var pivot = new GameObject("CameraPivot").transform;
            pivot.SetParent(go.transform, false);
            pivot.localPosition = new Vector3(0f, 1.68f, 0f);
            var aim = new GameObject("AimPivot").transform;
            aim.SetParent(pivot, false);
            var cameraGo = new GameObject("Main Camera");
            cameraGo.tag = "MainCamera";
            cameraGo.transform.SetParent(aim, false);
            var camera = cameraGo.AddComponent<Camera>();
            camera.nearClipPlane = 0.03f; // close enough that the viewmodel isn't clipped
            camera.farClipPlane = 400f;
            camera.fieldOfView = content.Camera.baseFov;
            camera.allowDynamicResolution = true; // lets the PerformanceGovernor scale resolution
            cameraGo.AddComponent<AudioListener>();

            var holder = new GameObject("WeaponHolder").transform;
            holder.SetParent(cameraGo.transform, false);
            holder.localPosition = new Vector3(0.17f, -0.19f, 0.32f);
            var sway = holder.gameObject.AddComponent<WeaponSway>();

            var cameraController = go.AddComponent<FPSCameraController>();
            Set(cameraController, "settings", content.Camera);
            Set(cameraController, "yawRoot", go.transform);
            Set(cameraController, "pitchPivot", pivot);
            Set(cameraController, "aimPivot", aim);
            Set(cameraController, "viewCamera", camera);

            touch = go.AddComponent<TouchInputSource>();
            Set(touch, "settings", content.Touch);
            var desktop = go.AddComponent<DesktopInputSource>();
            var router = go.AddComponent<PlayerInputRouter>();
            SetArray(router, "sources", new Object[] { touch, desktop });

            var inventory = go.AddComponent<WeaponInventory>();
            Set(inventory, "database", content.Database);
            SetArray(inventory, "defaultWeapons", content.Weapons.Cast<Object>().ToArray());
            Set(inventory, "viewModelParent", holder);
            Set(inventory, "sway", sway);

            var feedbackAudio = go.AddComponent<AudioSource>();
            feedbackAudio.playOnAwake = false;
            feedbackAudio.spatialBlend = 0f;
            var feedback = go.AddComponent<LocalPlayerFeedback>();
            Set(feedback, "cameraController", cameraController);
            Set(feedback, "uiAudio", feedbackAudio);

            var player = go.AddComponent<FPSPlayer>();
            Set(player, "input", router);
            Set(player, "cameraController", cameraController);
            Set(player, "sway", sway);
            Set(player, "weapons", inventory);
            Set(player, "aimAssistSettings", content.AimAssist);

            var spawn = new GameObject("SpawnPoint").AddComponent<SpawnPoint>();
            spawn.transform.position = new Vector3(0f, 0.05f, 0f);
            SetEnum(spawn, "team", (int)TeamId.Alpha);
            return player;
        }

        // ------------------------------------------------------------------
        // Systems
        // ------------------------------------------------------------------

        private static MatchController BuildSystems(GeneratedContent content, FPSPlayer player, int worldMask)
        {
            // One GameObject per persistent singleton: DontDestroyOnLoad applies to the
            // whole GameObject, and scene-scoped services must not be dragged along.
            var meta = new GameObject("[MetaGame]").AddComponent<MetaGame>();
            Set(meta, "progressionConfig", content.Progression);
            Set(meta, "matchRewardConfig", content.MatchRewards);
            Set(meta, "battlePassSeason", content.Season);
            Set(meta, "dailyRewardCalendar", content.DailyCalendar);
            Set(meta, "challengePool", content.Challenges);

            Set(new GameObject("[AdsManager]").AddComponent<AdsManager>(), "config", content.Ads);
            Set(new GameObject("[IAPStoreManager]").AddComponent<IAPStoreManager>(), "catalog", content.Store);
            Set(new GameObject("[ImpactEffectSystem]").AddComponent<ImpactEffectSystem>(), "defaultLibrary", content.Impacts);

            var matchGo = new GameObject("[Match]");
            var authority = matchGo.AddComponent<CombatAuthority>();
            SetEnum(authority, "mode", (int)HitAuthorityMode.LocalAuthoritative);
            SetMask(authority, "worldMask", worldMask);

            var match = matchGo.AddComponent<MatchController>();
            Set(match, "modeId", "range");
            Set(match, "scoreLimit", 50);
            Set(match, "timeLimitSeconds", 600f);
            Set(match, "localPlayer", player);

            var debugPanel = matchGo.AddComponent<MetaDebugPanel>();
            Set(debugPanel, "match", match);
            return match;
        }

        // ------------------------------------------------------------------
        // HUD
        // ------------------------------------------------------------------

        private static Font s_font;
        private static Sprite s_knob;
        private static Sprite s_square;

        private static void BuildHud(FPSPlayer player, MatchController match, TouchInputSource touch)
        {
#if UNITY_2022_2_OR_NEWER
            s_font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
#else
            s_font = Resources.GetBuiltinResource<Font>("Arial.ttf");
#endif
            s_knob = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Knob.psd");
            s_square = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UISprite.psd");

            var canvasGo = new GameObject("HUD");
            int uiLayer = LayerMask.NameToLayer("UI");
            if (uiLayer >= 0) canvasGo.layer = uiLayer;
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;
            // No GraphicRaycaster/EventSystem: touch input is handled by TouchInputSource.

            RectTransform safe = NewRect("SafeArea", canvasGo.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var fitter = safe.gameObject.AddComponent<SafeAreaFitter>();
            Set(fitter, "touchInput", touch);

            // Full-screen damage vignette (behind everything else).
            Image vignette = NewImage("DamageVignette", safe, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, null, new Color(0.8f, 0f, 0f, 0f));

            // Move stick (nested canvas: it changes every frame while moving).
            RectTransform stickRoot = NewRect("MoveStick", safe, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            stickRoot.gameObject.AddComponent<Canvas>();
            var stickGroup = stickRoot.gameObject.AddComponent<CanvasGroup>();
            Image stickBase = NewImage("Base", stickRoot, Vector2.zero, Vector2.zero, new Vector2(270f, 270f), new Vector2(240f, 240f), s_knob, new Color(1f, 1f, 1f, 0.25f));
            Image stickKnob = NewImage("Knob", stickBase.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(100f, 100f), s_knob, new Color(1f, 1f, 1f, 0.7f));
            var joystick = stickRoot.gameObject.AddComponent<VirtualJoystickView>();
            Set(joystick, "background", stickBase.rectTransform);
            Set(joystick, "knob", stickKnob.rectTransform);
            Set(joystick, "canvasGroup", stickGroup);
            Set(touch, "joystickView", joystick);

            // Buttons: layout follows the genre's muscle memory.
            Button(safe, "Fire", TouchAction.Fire, new Vector2(1f, 0f), new Vector2(-230f, 250f), 190f, "FIRE", true, 2);
            Button(safe, "FireLeft", TouchAction.Fire, new Vector2(0f, 0.5f), new Vector2(150f, 140f), 120f, "FIRE", false, 2);
            Button(safe, "Aim", TouchAction.Aim, new Vector2(1f, 0f), new Vector2(-430f, 370f), 120f, "ADS", false, 1);
            Button(safe, "Jump", TouchAction.Jump, new Vector2(1f, 0f), new Vector2(-105f, 470f), 110f, "JUMP", false, 1);
            Button(safe, "Crouch", TouchAction.Crouch, new Vector2(1f, 0f), new Vector2(-105f, 120f), 110f, "SLIDE", false, 1);
            Button(safe, "Reload", TouchAction.Reload, new Vector2(1f, 0f), new Vector2(-420f, 150f), 95f, "R", false, 1);
            Button(safe, "Switch", TouchAction.SwitchWeapon, new Vector2(1f, 1f), new Vector2(-150f, -230f), 120f, "SWAP", false, 1);

            // Crosshair + hit marker + reload ring (nested canvas: dynamic).
            RectTransform center = NewRect("Center", safe, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(200f, 200f));
            center.gameObject.AddComponent<Canvas>();
            RectTransform crosshair = NewRect("Crosshair", center, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            var crosshairGroup = crosshair.gameObject.AddComponent<CanvasGroup>();
            Color crosshairColor = new Color(1f, 1f, 1f, 0.9f);
            Image up = NewImage("Up", crosshair, Center, Center, new Vector2(0f, 10f), new Vector2(4f, 16f), s_square, crosshairColor);
            Image down = NewImage("Down", crosshair, Center, Center, new Vector2(0f, -10f), new Vector2(4f, 16f), s_square, crosshairColor);
            Image left = NewImage("Left", crosshair, Center, Center, new Vector2(-10f, 0f), new Vector2(16f, 4f), s_square, crosshairColor);
            Image right = NewImage("Right", crosshair, Center, Center, new Vector2(10f, 0f), new Vector2(16f, 4f), s_square, crosshairColor);
            NewImage("Dot", crosshair, Center, Center, Vector2.zero, new Vector2(4f, 4f), s_square, crosshairColor);

            RectTransform hitMarkerRoot = NewRect("HitMarker", center, Center, Center, Vector2.zero, Vector2.zero);
            var hitMarkerGroup = hitMarkerRoot.gameObject.AddComponent<CanvasGroup>();
            Image hitBar = null;
            foreach (Vector2 corner in new[] { new Vector2(1f, 1f), new Vector2(-1f, 1f), new Vector2(1f, -1f), new Vector2(-1f, -1f) })
            {
                Image bar = NewImage("Bar", hitMarkerRoot, Center, Center, corner * 14f, new Vector2(4f, 14f), s_square, Color.white);
                bar.rectTransform.localRotation = Quaternion.Euler(0f, 0f, corner.x * corner.y > 0f ? -45f : 45f);
                if (hitBar == null) hitBar = bar;
            }

            Image reloadRing = NewImage("ReloadFill", center, Center, Center, Vector2.zero, new Vector2(70f, 70f), s_knob, new Color(1f, 1f, 1f, 0.35f));
            reloadRing.type = Image.Type.Filled;
            reloadRing.fillMethod = Image.FillMethod.Radial360;
            reloadRing.fillAmount = 0f;
            reloadRing.enabled = false;

            // Health (top left), ammo (bottom right), match info (top center), toast.
            NewImage("HealthBack", safe, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(190f, -50f), new Vector2(320f, 18f), s_square, new Color(0f, 0f, 0f, 0.5f));
            Image healthFill = NewImage("HealthFill", safe, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(190f, -50f), new Vector2(316f, 14f), s_square, new Color(0.3f, 0.95f, 0.45f));
            healthFill.type = Image.Type.Filled;
            healthFill.fillMethod = Image.FillMethod.Horizontal;

            Text magazine = NewText("Magazine", safe, new Vector2(1f, 0f), new Vector2(-560f, 60f), new Vector2(120f, 70f), 56, TextAnchor.MiddleRight, "30");
            Text reserve = NewText("Reserve", safe, new Vector2(1f, 0f), new Vector2(-460f, 52f), new Vector2(90f, 50f), 30, TextAnchor.MiddleLeft, "150");
            Text weaponName = NewText("WeaponName", safe, new Vector2(1f, 0f), new Vector2(-520f, 110f), new Vector2(300f, 40f), 24, TextAnchor.MiddleCenter, "");
            Text timer = NewText("Timer", safe, new Vector2(0.5f, 1f), new Vector2(0f, -40f), new Vector2(200f, 50f), 34, TextAnchor.MiddleCenter, "10:00");
            Text score = NewText("Score", safe, new Vector2(0.5f, 1f), new Vector2(0f, -82f), new Vector2(400f, 36f), 24, TextAnchor.MiddleCenter, "");
            Text toast = NewText("Toast", safe, new Vector2(0.5f, 0.5f), new Vector2(0f, 190f), new Vector2(700f, 60f), 40, TextAnchor.MiddleCenter, "");
            toast.fontStyle = FontStyle.Bold;

            var hud = canvasGo.AddComponent<HudView>();
            Set(hud, "player", player);
            Set(hud, "match", match);
            Set(hud, "magazineText", magazine);
            Set(hud, "reserveText", reserve);
            Set(hud, "weaponNameText", weaponName);
            Set(hud, "reloadFill", reloadRing);
            Set(hud, "healthFill", healthFill);
            Set(hud, "damageVignette", vignette);
            Set(hud, "crosshairGroup", crosshairGroup);
            Set(hud, "crosshairUp", up.rectTransform);
            Set(hud, "crosshairDown", down.rectTransform);
            Set(hud, "crosshairLeft", left.rectTransform);
            Set(hud, "crosshairRight", right.rectTransform);
            Set(hud, "hitMarker", hitMarkerGroup);
            Set(hud, "hitMarkerImage", hitBar);
            Set(hud, "timerText", timer);
            Set(hud, "scoreText", score);
            Set(hud, "toastText", toast);
        }

        private static readonly Vector2 Center = new Vector2(0.5f, 0.5f);

        private static void Button(RectTransform parent, string name, TouchAction action, Vector2 anchor, Vector2 position, float size,
            string label, bool lookDrag, int priority)
        {
            Image image = NewImage(name, parent, anchor, anchor, position, new Vector2(size, size), s_knob, new Color(1f, 1f, 1f, 0.35f));
            var group = image.gameObject.AddComponent<CanvasGroup>();
            NewText("Label", image.rectTransform, Center, Vector2.zero, new Vector2(size, 40f), Mathf.RoundToInt(size * 0.17f + 8f), TextAnchor.MiddleCenter, label);
            var button = image.gameObject.AddComponent<TouchButton>();
            SetEnum(button, "action", (int)action);
            Set(button, "allowLookDrag", lookDrag);
            Set(button, "priority", priority);
            Set(button, "canvasGroup", group);
        }

        private static RectTransform NewRect(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, Vector2 position, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = parent.gameObject.layer;
            var rect = (RectTransform)go.transform;
            rect.SetParent(parent, false);
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            return rect;
        }

        private static Image NewImage(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, Vector2 position, Vector2 size, Sprite sprite, Color color)
        {
            RectTransform rect = NewRect(name, parent, anchorMin, anchorMax, position, size);
            var image = rect.gameObject.AddComponent<Image>();
            image.sprite = sprite;
            image.color = color;
            image.raycastTarget = false; // HUD never needs UGUI raycasts
            return image;
        }

        private static Text NewText(string name, Transform parent, Vector2 anchor, Vector2 position, Vector2 size, int fontSize, TextAnchor alignment, string value)
        {
            RectTransform rect = NewRect(name, parent, anchor, anchor, position, size);
            var text = rect.gameObject.AddComponent<Text>();
            text.font = s_font;
            text.fontSize = fontSize;
            text.alignment = alignment;
            text.color = Color.white;
            text.text = value;
            text.raycastTarget = false;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            return text;
        }

        private static void AddToBuildSettings(string path)
        {
            List<EditorBuildSettingsScene> scenes = EditorBuildSettings.scenes.ToList();
            if (scenes.Any(s => s.path == path)) return;
            scenes.Insert(0, new EditorBuildSettingsScene(path, true));
            EditorBuildSettings.scenes = scenes.ToArray();
        }
    }
}
