using System;
using System.Collections;
using System.Collections.Generic;
using SubnauticaClone.Player;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SubnauticaClone.UI
{
    public class EvaPhoneExperience : MonoBehaviour
    {
        private const float TransitionDuration = 0.28f;
        private const float DownloadDuration = 2.8f;
        private const int HomePageCount = 2;

        private static bool hasCreated;

        private readonly List<Text> statusClockTexts = new List<Text>();

        private CanvasGroup lockScreenGroup;
        private CanvasGroup homeScreenGroup;
        private CanvasGroup appStoreGroup;
        private CanvasGroup gameGroup;
        private CanvasGroup activeScreen;

        private Slider unlockSlider;
        private Text unlockLabel;
        private bool unlockTriggered;

        private ScrollRect homeScrollRect;
        private RectTransform homeViewport;
        private RectTransform homeContent;
        private RectTransform[] homePages;
        private Image[] pageDots;
        private RectTransform installIconRoot;
        private Vector2 lastViewportSize;

        private Text lockTimeText;
        private Text lockDateText;

        private Button featuredAppButton;
        private Text featuredAppButtonLabel;
        private Image featuredDownloadTrack;
        private Image featuredDownloadFill;
        private RectTransform featuredDownloadStop;

        private bool appInstalled;
        private bool isDownloading;
        private float downloadProgress;
        private float inputRefreshTimer;
        private Coroutine screenTransitionRoutine;
        private Coroutine downloadRoutine;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOverlay()
        {
            hasCreated = false;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateOverlay()
        {
            if (hasCreated || FindFirstObjectByType<EvaPhoneExperience>() != null)
            {
                return;
            }

            hasCreated = true;
            var overlayObject = new GameObject("Eva Phone Experience");
            DontDestroyOnLoad(overlayObject);
            overlayObject.AddComponent<EvaPhoneExperience>();
        }

        private void Awake()
        {
            DontDestroyOnLoad(gameObject);
            EnsureEventSystem();
            BuildExperience();
            ShowScreenImmediately(lockScreenGroup);
            ForceInteractiveInput();
        }

        private void Update()
        {
            ForceInteractiveInput();
            UpdateClockLabels();
            UpdateUnlockSlider();
            UpdateHomePaging();
            RefreshHomeLayoutIfNeeded();
        }

        private void BuildExperience()
        {
            var canvasObject = new GameObject("EvaPhoneCanvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasObject.transform.SetParent(transform, false);

            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 500;

            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            var root = canvasObject.GetComponent<RectTransform>();
            PhoneUiFactory.Stretch(root, 0f);

            var sceneDim = PhoneUiFactory.CreateImage(root, "SceneDim", new Color(0.03f, 0.04f, 0.08f, 0.72f));
            PhoneUiFactory.Stretch(sceneDim.rectTransform, 0f);

            var phoneShadow = PhoneUiFactory.CreateImage(root, "PhoneShadow", new Color(0f, 0f, 0f, 0.42f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(phoneShadow.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(600f, 1120f), new Vector2(0f, -8f));
            phoneShadow.rectTransform.localScale = new Vector3(1.02f, 1.02f, 1f);

            var phoneBody = PhoneUiFactory.CreateImage(root, "PhoneBody", new Color(0.05f, 0.06f, 0.08f, 1f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(phoneBody.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(580f, 1090f), Vector2.zero);
            PhoneUiFactory.AddSoftShadow(phoneBody.gameObject, new Color(0f, 0f, 0f, 0.36f), new Vector2(0f, -18f));

            var chromeHighlight = PhoneUiFactory.CreateImage(phoneBody.transform, "ChromeHighlight", new Color(1f, 1f, 1f, 0.04f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.Stretch(chromeHighlight.rectTransform, 5f);

            var screenMaskObject = new GameObject("ScreenMask", typeof(RectTransform), typeof(Image), typeof(Mask));
            screenMaskObject.transform.SetParent(phoneBody.transform, false);
            var screenMaskRect = screenMaskObject.GetComponent<RectTransform>();
            PhoneUiFactory.Stretch(screenMaskRect, 16f);

            var screenMaskImage = screenMaskObject.GetComponent<Image>();
            screenMaskImage.sprite = PhoneUiFactory.RoundedSprite;
            screenMaskImage.type = Image.Type.Sliced;
            screenMaskImage.color = Color.black;
            screenMaskObject.GetComponent<Mask>().showMaskGraphic = true;

            BuildScreens(screenMaskRect);
            BuildPhoneDecor(screenMaskRect);
        }

        private void BuildScreens(RectTransform screenRoot)
        {
            lockScreenGroup = CreateScreenRoot(screenRoot, "LockScreen");
            homeScreenGroup = CreateScreenRoot(screenRoot, "HomeScreen");
            appStoreGroup = CreateScreenRoot(screenRoot, "AppStoreScreen");
            gameGroup = CreateScreenRoot(screenRoot, "GameScreen");

            BuildLockScreen(lockScreenGroup.transform);
            BuildHomeScreen(homeScreenGroup.transform);
            BuildAppStoreScreen(appStoreGroup.transform);
            BuildGameScreen(gameGroup.transform);

            PhoneUiFactory.SetCanvasGroup(homeScreenGroup, false);
            PhoneUiFactory.SetCanvasGroup(appStoreGroup, false);
            PhoneUiFactory.SetCanvasGroup(gameGroup, false);
        }

        private void BuildPhoneDecor(RectTransform screenRoot)
        {
            var island = PhoneUiFactory.CreateImage(screenRoot, "DynamicIsland", new Color(0f, 0f, 0f, 0.96f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(island.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(160f, 38f), new Vector2(0f, -18f));

            var islandGlow = PhoneUiFactory.CreateImage(island.transform, "IslandGlow", new Color(1f, 1f, 1f, 0.03f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.Stretch(islandGlow.rectTransform, 3f);

            var homeIndicatorButton = new GameObject("HomeIndicatorButton", typeof(RectTransform), typeof(Image), typeof(Button)).GetComponent<Button>();
            homeIndicatorButton.transform.SetParent(screenRoot, false);
            var buttonRect = homeIndicatorButton.GetComponent<RectTransform>();
            PhoneUiFactory.SetRect(buttonRect, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(210f, 38f), new Vector2(0f, 18f));
            homeIndicatorButton.GetComponent<Image>().color = new Color(1f, 1f, 1f, 0f);
            PhoneUiFactory.Hook(homeIndicatorButton, ReturnToHome);

            var homeIndicator = PhoneUiFactory.CreateImage(buttonRect, "HomeIndicator", new Color(1f, 1f, 1f, 0.86f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(homeIndicator.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(150f, 8f), Vector2.zero);
        }

        private void BuildLockScreen(Transform parent)
        {
            BuildWallpaper(parent, new Color(0.07f, 0.08f, 0.16f), new Color(0.86f, 0.24f, 0.58f, 0.34f), new Color(0.23f, 0.51f, 1f, 0.28f));
            BuildStatusBar(parent, Color.white, new Color(1f, 1f, 1f, 0.9f), false);

            lockTimeText = PhoneUiFactory.CreateText(parent, "LockTime", "9:41", 118, TextAnchor.MiddleCenter, Color.white, FontStyle.Bold);
            PhoneUiFactory.SetRect(lockTimeText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(360f, 120f), new Vector2(0f, -200f));

            lockDateText = PhoneUiFactory.CreateText(parent, "LockDate", "Saturday, March 7", 28, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.92f));
            PhoneUiFactory.SetRect(lockDateText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(420f, 40f), new Vector2(0f, -270f));

            var messageCard = PhoneUiFactory.CreateImage(parent, "MessageCard", new Color(1f, 1f, 1f, 0.12f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(messageCard.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(420f, 150f), new Vector2(0f, -380f));
            PhoneUiFactory.AddOutline(messageCard.gameObject, new Color(1f, 1f, 1f, 0.1f), new Vector2(1f, -1f));

            var messageLabel = PhoneUiFactory.CreateText(messageCard.transform, "FromLabel", "SPECIAL DELIVERY", 18, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.68f), FontStyle.Bold);
            PhoneUiFactory.SetRect(messageLabel.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-44f, 24f), new Vector2(22f, -20f));

            var messageText = PhoneUiFactory.CreateText(
                messageCard.transform,
                "MessageText",
                "Unlock for a tiny App Store surprise and three scratch-off gifts made just for Eva.",
                24,
                TextAnchor.UpperLeft,
                Color.white);
            PhoneUiFactory.SetRect(messageText.rectTransform, new Vector2(0f, 0f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-44f, -54f), new Vector2(22f, -52f));

            BuildUnlockSlider(parent);

            var footerText = PhoneUiFactory.CreateText(parent, "FooterText", "Swipe to unlock", 24, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.72f), FontStyle.Bold);
            PhoneUiFactory.SetRect(footerText.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(340f, 30f), new Vector2(0f, 112f));
        }

        private void BuildUnlockSlider(Transform parent)
        {
            var sliderRoot = new GameObject("UnlockSlider", typeof(RectTransform), typeof(Slider)).GetComponent<Slider>();
            sliderRoot.transform.SetParent(parent, false);
            var sliderRect = sliderRoot.GetComponent<RectTransform>();
            PhoneUiFactory.SetRect(sliderRect, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(410f, 84f), new Vector2(0f, 168f));

            var background = PhoneUiFactory.CreateImage(sliderRect, "Track", new Color(1f, 1f, 1f, 0.15f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.Stretch(background.rectTransform, 0f);

            unlockLabel = PhoneUiFactory.CreateText(sliderRect, "UnlockLabel", "Swipe to begin Eva's game", 24, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.88f), FontStyle.Bold);
            PhoneUiFactory.Stretch(unlockLabel.rectTransform, 0f);

            var handleArea = PhoneUiFactory.CreateRect(sliderRect, "HandleSlideArea");
            PhoneUiFactory.Stretch(handleArea, 8f);

            var handle = PhoneUiFactory.CreateImage(handleArea, "Handle", new Color(1f, 1f, 1f, 0.96f), PhoneUiFactory.CircleSprite);
            PhoneUiFactory.SetRect(handle.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(68f, 68f), Vector2.zero);
            handle.preserveAspect = true;
            handle.raycastTarget = true;
            PhoneUiFactory.AddSoftShadow(handle.gameObject, new Color(0f, 0f, 0f, 0.24f), new Vector2(0f, -6f));

            var handleGlyph = PhoneUiFactory.CreateText(handle.transform, "HandleGlyph", ">", 40, TextAnchor.MiddleCenter, new Color(0.18f, 0.26f, 0.41f, 0.92f), FontStyle.Bold);
            PhoneUiFactory.Stretch(handleGlyph.rectTransform, 0f);

            sliderRoot.minValue = 0f;
            sliderRoot.maxValue = 1f;
            sliderRoot.direction = Slider.Direction.LeftToRight;
            sliderRoot.targetGraphic = handle;
            sliderRoot.handleRect = handle.rectTransform;
            sliderRoot.interactable = true;
            sliderRoot.value = 0f;
            sliderRoot.fillRect = null;
            sliderRoot.onValueChanged.AddListener(OnUnlockSliderChanged);

            unlockSlider = sliderRoot;
        }

        private void BuildHomeScreen(Transform parent)
        {
            BuildWallpaper(parent, new Color(0.06f, 0.07f, 0.16f), new Color(0.91f, 0.4f, 0.65f, 0.22f), new Color(0.26f, 0.66f, 1f, 0.26f));
            BuildStatusBar(parent, Color.white, new Color(1f, 1f, 1f, 0.84f), true);

            var greeting = PhoneUiFactory.CreateText(parent, "Greeting", "Made for Eva", 24, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.84f), FontStyle.Bold);
            PhoneUiFactory.SetRect(greeting.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(260f, 28f), new Vector2(0f, -70f));

            var scrollRoot = new GameObject("HomeScroll", typeof(RectTransform), typeof(Image), typeof(ScrollRect), typeof(RectMask2D));
            scrollRoot.transform.SetParent(parent, false);
            homeViewport = scrollRoot.GetComponent<RectTransform>();
            PhoneUiFactory.SetRect(homeViewport, new Vector2(0f, 0f), new Vector2(1f, 1f), new Vector2(0.5f, 0.5f), new Vector2(-40f, -280f), new Vector2(0f, -20f));

            var viewportImage = scrollRoot.GetComponent<Image>();
            viewportImage.color = new Color(1f, 1f, 1f, 0f);

            homeScrollRect = scrollRoot.GetComponent<ScrollRect>();
            homeScrollRect.horizontal = true;
            homeScrollRect.vertical = false;
            homeScrollRect.movementType = ScrollRect.MovementType.Clamped;
            homeScrollRect.inertia = true;
            homeScrollRect.decelerationRate = 0.12f;
            homeScrollRect.scrollSensitivity = 0f;
            homeScrollRect.viewport = homeViewport;

            homeContent = PhoneUiFactory.CreateRect(homeViewport, "Content");
            homeContent.anchorMin = new Vector2(0f, 0f);
            homeContent.anchorMax = new Vector2(0f, 1f);
            homeContent.pivot = new Vector2(0f, 0.5f);
            homeContent.anchoredPosition = Vector2.zero;
            homeScrollRect.content = homeContent;

            homePages = new RectTransform[HomePageCount];
            for (var i = 0; i < HomePageCount; i++)
            {
                homePages[i] = PhoneUiFactory.CreateRect(homeContent, $"Page{i + 1}");
                var grid = homePages[i].gameObject.AddComponent<GridLayoutGroup>();
                grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
                grid.constraintCount = 4;
                grid.spacing = new Vector2(16f, 24f);
                grid.startCorner = GridLayoutGroup.Corner.UpperLeft;
                grid.startAxis = GridLayoutGroup.Axis.Horizontal;
                grid.childAlignment = TextAnchor.UpperCenter;
                grid.padding = new RectOffset(6, 6, 8, 8);
            }

            BuildHomeIcons();

            var pageDotRoot = PhoneUiFactory.CreateRect(parent, "PageDots");
            PhoneUiFactory.SetRect(pageDotRoot, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(120f, 12f), new Vector2(0f, 130f));
            pageDots = new Image[HomePageCount];
            for (var i = 0; i < HomePageCount; i++)
            {
                var dot = PhoneUiFactory.CreateImage(pageDotRoot, $"Dot{i}", i == 0 ? Color.white : new Color(1f, 1f, 1f, 0.34f), PhoneUiFactory.CircleSprite);
                PhoneUiFactory.SetRect(dot.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(10f, 10f), new Vector2((i - 0.5f) * 22f, 0f));
                dot.preserveAspect = true;
                pageDots[i] = dot;
            }

            var dock = PhoneUiFactory.CreateImage(parent, "Dock", new Color(1f, 1f, 1f, 0.14f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(dock.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(456f, 114f), new Vector2(0f, 46f));
            PhoneUiFactory.AddOutline(dock.gameObject, new Color(1f, 1f, 1f, 0.08f), new Vector2(1f, -1f));

            BuildDockIcon(dock.transform, -152f, "Phone", "TEL", new Color(0.22f, 0.8f, 0.47f));
            BuildDockIcon(dock.transform, -50f, "Texts", "SMS", new Color(0.2f, 0.78f, 0.38f));
            BuildDockIcon(dock.transform, 52f, "Safari", "WEB", new Color(0.28f, 0.62f, 1f));
            BuildDockIcon(dock.transform, 154f, "Music", "MUS", new Color(1f, 0.27f, 0.51f));
        }

        private void BuildHomeIcons()
        {
            CreateAppIcon(homePages[0], "Messages", "SMS", new Color(0.23f, 0.84f, 0.46f));
            CreateAppIcon(homePages[0], "Photos", "PIC", new Color(0.95f, 0.58f, 0.18f));
            CreateAppIcon(homePages[0], "Camera", "CAM", new Color(0.22f, 0.22f, 0.27f));
            CreateAppIcon(homePages[0], "Calendar", "31", new Color(0.96f, 0.28f, 0.3f));
            CreateAppIcon(homePages[0], "Notes", "NOTE", new Color(0.98f, 0.84f, 0.2f));
            CreateAppIcon(homePages[0], "Clock", "CLK", new Color(0.18f, 0.18f, 0.2f));
            CreateAppIcon(homePages[0], "Maps", "MAP", new Color(0.34f, 0.72f, 1f));
            CreateAppIcon(homePages[0], "Music", "MUS", new Color(1f, 0.25f, 0.58f));
            CreateAppIcon(homePages[0], "App Store", "A", new Color(0.16f, 0.56f, 1f), OpenAppStore);
            CreateAppIcon(homePages[0], "TikTok", "TT", new Color(0.07f, 0.07f, 0.1f));
            CreateAppIcon(homePages[0], "Weather", "SUN", new Color(0.31f, 0.72f, 1f));
            CreateAppIcon(homePages[0], "Settings", "SET", new Color(0.54f, 0.58f, 0.64f));

            CreateAppIcon(homePages[1], "Pinterest", "PIN", new Color(0.9f, 0.21f, 0.25f));
            CreateAppIcon(homePages[1], "Spotify", "SP", new Color(0.13f, 0.78f, 0.37f));
            CreateAppIcon(homePages[1], "Safari", "WEB", new Color(0.28f, 0.62f, 1f));
            CreateAppIcon(homePages[1], "Photos", "PIC", new Color(0.94f, 0.58f, 0.18f));
            installIconRoot = CreateAppIcon(homePages[1], "Eva Scratchers", "EVA", new Color(1f, 0.43f, 0.58f), OpenGame).GetComponent<RectTransform>();
            installIconRoot.gameObject.SetActive(false);
            CreateAppIcon(homePages[1], "Recipes", "CHEF", new Color(0.98f, 0.63f, 0.32f));
            CreateAppIcon(homePages[1], "Photoshop", "PS", new Color(0.08f, 0.45f, 0.78f));
            CreateAppIcon(homePages[1], "Notes", "NOTE", new Color(0.98f, 0.84f, 0.2f));
        }

        private void BuildDockIcon(Transform parent, float xPosition, string title, string glyph, Color color)
        {
            var root = CreateAppIcon(parent, title, glyph, color);
            var rect = root.GetComponent<RectTransform>();
            PhoneUiFactory.SetRect(rect, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(90f, 92f), new Vector2(xPosition, 0f));
        }

        private void BuildAppStoreScreen(Transform parent)
        {
            BuildWallpaper(parent, new Color(0.95f, 0.96f, 0.99f), new Color(1f, 0.48f, 0.66f, 0.16f), new Color(0.35f, 0.64f, 1f, 0.12f));
            BuildStatusBar(parent, new Color(0.08f, 0.09f, 0.14f), new Color(0.08f, 0.09f, 0.14f, 0.72f), true);

            var backButton = PhoneUiFactory.CreateGhostButton(parent, "BackButton", "< Home", 22, new Color(0.17f, 0.42f, 1f, 0.96f), out _);
            PhoneUiFactory.SetRect(backButton.GetComponent<RectTransform>(), new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(120f, 42f), new Vector2(26f, -74f));
            PhoneUiFactory.Hook(backButton, ReturnToHome);

            var heading = PhoneUiFactory.CreateText(parent, "AppStoreHeading", "Eva's game", 54, TextAnchor.UpperLeft, new Color(0.07f, 0.08f, 0.14f), FontStyle.Bold);
            PhoneUiFactory.SetRect(heading.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-60f, 60f), new Vector2(30f, -128f));

            var subheading = PhoneUiFactory.CreateText(parent, "AppStoreSubHeading", "A sweet little mock App Store just for her.", 24, TextAnchor.UpperLeft, new Color(0.18f, 0.2f, 0.28f, 0.78f));
            PhoneUiFactory.SetRect(subheading.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-60f, 30f), new Vector2(32f, -184f));

            var searchPill = PhoneUiFactory.CreateImage(parent, "SearchPill", new Color(1f, 1f, 1f, 0.84f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(searchPill.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0.5f, 1f), new Vector2(-56f, 62f), new Vector2(0f, -238f));
            PhoneUiFactory.AddSoftShadow(searchPill.gameObject, new Color(0f, 0f, 0f, 0.08f), new Vector2(0f, -5f));

            var searchText = PhoneUiFactory.CreateText(searchPill.transform, "SearchText", "Search: Eva's game", 22, TextAnchor.MiddleLeft, new Color(0.18f, 0.2f, 0.28f, 0.66f));
            PhoneUiFactory.SetRect(searchText.rectTransform, new Vector2(0f, 0f), new Vector2(1f, 1f), new Vector2(0f, 0.5f), new Vector2(-36f, 0f), new Vector2(24f, 0f));

            var featuredCard = new GameObject("FeaturedCard", typeof(RectTransform), typeof(Image), typeof(Button)).GetComponent<Button>();
            featuredCard.transform.SetParent(parent, false);
            var featuredCardRect = featuredCard.GetComponent<RectTransform>();
            PhoneUiFactory.SetRect(featuredCardRect, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0.5f, 1f), new Vector2(-56f, 220f), new Vector2(0f, -350f));
            var featuredCardImage = featuredCard.GetComponent<Image>();
            featuredCardImage.sprite = PhoneUiFactory.RoundedSprite;
            featuredCardImage.type = Image.Type.Sliced;
            featuredCardImage.color = new Color(1f, 1f, 1f, 0.96f);
            PhoneUiFactory.AddSoftShadow(featuredCard.gameObject, new Color(0f, 0f, 0f, 0.1f), new Vector2(0f, -8f));
            PhoneUiFactory.Hook(featuredCard, StartDownloadOrOpen);

            var featureIcon = PhoneUiFactory.CreateImage(featuredCard.transform, "FeatureIcon", new Color(1f, 0.42f, 0.58f, 1f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(featureIcon.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(94f, 94f), new Vector2(24f, -26f));
            var featureGlyph = PhoneUiFactory.CreateText(featureIcon.transform, "FeatureGlyph", "EVA", 32, TextAnchor.MiddleCenter, Color.white, FontStyle.Bold);
            PhoneUiFactory.Stretch(featureGlyph.rectTransform, 0f);

            var featureName = PhoneUiFactory.CreateText(featuredCard.transform, "FeatureName", "Eva Scratchers", 30, TextAnchor.UpperLeft, new Color(0.09f, 0.1f, 0.14f), FontStyle.Bold);
            PhoneUiFactory.SetRect(featureName.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-210f, 34f), new Vector2(136f, -30f));

            var featureSubtitle = PhoneUiFactory.CreateText(featuredCard.transform, "FeatureSubtitle", "Three custom scratch tickets with surprise Amazon-style reward codes.", 20, TextAnchor.UpperLeft, new Color(0.21f, 0.23f, 0.3f, 0.78f));
            PhoneUiFactory.SetRect(featureSubtitle.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-210f, 58f), new Vector2(136f, -72f));

            var featureCaption = PhoneUiFactory.CreateText(featuredCard.transform, "FeatureCaption", "Made with extra cute energy. Tap GET and it opens right inside the phone.", 18, TextAnchor.UpperLeft, new Color(0.28f, 0.3f, 0.36f, 0.86f));
            PhoneUiFactory.SetRect(featureCaption.rectTransform, new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(0f, 0f), new Vector2(-44f, 40f), new Vector2(24f, 18f));

            featuredAppButton = PhoneUiFactory.CreateButton(featuredCard.transform, "GetButton", new Color(0.17f, 0.42f, 1f, 1f), "GET", 22, out featuredAppButtonLabel);
            PhoneUiFactory.SetRect(featuredAppButton.GetComponent<RectTransform>(), new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(124f, 50f), new Vector2(-22f, -34f));
            PhoneUiFactory.Hook(featuredAppButton, StartDownloadOrOpen);

            featuredDownloadTrack = PhoneUiFactory.CreateImage(featuredAppButton.transform, "DownloadTrack", new Color(1f, 1f, 1f, 0.28f), PhoneUiFactory.CircleSprite);
            PhoneUiFactory.SetRect(featuredDownloadTrack.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(34f, 34f), Vector2.zero);
            featuredDownloadTrack.type = Image.Type.Filled;
            featuredDownloadTrack.fillMethod = Image.FillMethod.Radial360;
            featuredDownloadTrack.fillAmount = 1f;
            featuredDownloadTrack.preserveAspect = true;
            featuredDownloadTrack.gameObject.SetActive(false);

            featuredDownloadFill = PhoneUiFactory.CreateImage(featuredAppButton.transform, "DownloadFill", Color.white, PhoneUiFactory.CircleSprite);
            PhoneUiFactory.SetRect(featuredDownloadFill.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(34f, 34f), Vector2.zero);
            featuredDownloadFill.type = Image.Type.Filled;
            featuredDownloadFill.fillMethod = Image.FillMethod.Radial360;
            featuredDownloadFill.fillOrigin = 2;
            featuredDownloadFill.fillAmount = 0f;
            featuredDownloadFill.preserveAspect = true;
            featuredDownloadFill.gameObject.SetActive(false);

            featuredDownloadStop = PhoneUiFactory.CreateRect(featuredAppButton.transform, "DownloadStop");
            PhoneUiFactory.SetRect(featuredDownloadStop, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(10f, 10f), Vector2.zero);
            var stopIcon = PhoneUiFactory.CreateImage(featuredDownloadStop, "StopIcon", Color.white, PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.Stretch(stopIcon.rectTransform, 0f);
            featuredDownloadStop.gameObject.SetActive(false);

            var listHeader = PhoneUiFactory.CreateText(parent, "ListHeader", "Placeholder favorites", 28, TextAnchor.UpperLeft, new Color(0.09f, 0.1f, 0.14f), FontStyle.Bold);
            PhoneUiFactory.SetRect(listHeader.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-60f, 34f), new Vector2(32f, -592f));

            CreateStoreRow(parent, -650f, "Cooking Game 1", "Cute kitchen chaos.", new Color(1f, 0.64f, 0.3f));
            CreateStoreRow(parent, -744f, "Cooking Game 2", "More recipes, more sparkles.", new Color(1f, 0.55f, 0.35f));
            CreateStoreRow(parent, -838f, "Cooking Game 3", "One more placeholder favorite.", new Color(1f, 0.45f, 0.38f));
            CreateStoreRow(parent, -932f, "TikTok", "Temporary favorite slot.", new Color(0.08f, 0.08f, 0.1f));

            UpdateDownloadButtonVisual();
        }

        private void BuildGameScreen(Transform parent)
        {
            BuildWallpaper(parent, new Color(0.99f, 0.93f, 0.95f), new Color(1f, 0.44f, 0.58f, 0.18f), new Color(1f, 0.74f, 0.32f, 0.14f));
            BuildStatusBar(parent, new Color(0.1f, 0.08f, 0.14f), new Color(0.1f, 0.08f, 0.14f, 0.72f), true);

            var backButton = PhoneUiFactory.CreateGhostButton(parent, "BackToStore", "< App Store", 22, new Color(0.97f, 0.23f, 0.47f, 0.96f), out _);
            PhoneUiFactory.SetRect(backButton.GetComponent<RectTransform>(), new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(158f, 42f), new Vector2(26f, -74f));
            PhoneUiFactory.Hook(backButton, OpenAppStore);

            var heading = PhoneUiFactory.CreateText(parent, "GameHeading", "Eva Scratchers", 52, TextAnchor.UpperLeft, new Color(0.17f, 0.08f, 0.16f), FontStyle.Bold);
            PhoneUiFactory.SetRect(heading.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-60f, 56f), new Vector2(30f, -128f));

            var subtitle = PhoneUiFactory.CreateText(parent, "GameSubtitle", "Scratch each silver ticket to reveal the gift hint and reward code underneath.", 22, TextAnchor.UpperLeft, new Color(0.29f, 0.16f, 0.25f, 0.8f));
            PhoneUiFactory.SetRect(subtitle.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-60f, 42f), new Vector2(32f, -186f));

            BuildScratchCard(parent, -320f, "Ticket 01", "COZY KITCHEN DROP", "Hint: cute cookware or a recipe-day treat.", "AMZ-COOKING-SET-01", new Color(1f, 0.61f, 0.42f));
            BuildScratchCard(parent, -540f, "Ticket 02", "SOFT GIRL COMFORT", "Hint: blanket, candle, or comfy-night surprise.", "AMZ-COZY-BLANKET-02", new Color(0.97f, 0.49f, 0.62f));
            BuildScratchCard(parent, -760f, "Ticket 03", "JUST BECAUSE", "Hint: a sweet little wishlist pick.", "AMZ-CUTE-TREAT-03", new Color(0.98f, 0.76f, 0.36f));
        }

        private void BuildScratchCard(Transform parent, float yPosition, string ticketNumber, string title, string hint, string code, Color accent)
        {
            var card = PhoneUiFactory.CreateImage(parent, $"{ticketNumber}Card", new Color(1f, 1f, 1f, 0.9f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(card.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(430f, 190f), new Vector2(0f, yPosition));
            PhoneUiFactory.AddSoftShadow(card.gameObject, new Color(0f, 0f, 0f, 0.08f), new Vector2(0f, -8f));

            var badge = PhoneUiFactory.CreateImage(card.transform, "Badge", accent, PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(badge.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(94f, 30f), new Vector2(18f, -16f));
            var badgeText = PhoneUiFactory.CreateText(badge.transform, "BadgeText", ticketNumber, 16, TextAnchor.MiddleCenter, Color.white, FontStyle.Bold);
            PhoneUiFactory.Stretch(badgeText.rectTransform, 0f);

            var titleText = PhoneUiFactory.CreateText(card.transform, "CardTitle", title, 22, TextAnchor.UpperLeft, new Color(0.16f, 0.1f, 0.14f), FontStyle.Bold);
            PhoneUiFactory.SetRect(titleText.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-160f, 30f), new Vector2(18f, -58f));

            var scratchArea = PhoneUiFactory.CreateRect(card.transform, "ScratchArea");
            PhoneUiFactory.SetRect(scratchArea, new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(0.5f, 0f), new Vector2(-28f, 116f), new Vector2(0f, 18f));

            var revealBackground = PhoneUiFactory.CreateImage(scratchArea, "RevealBackground", new Color(accent.r, accent.g, accent.b, 0.18f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.Stretch(revealBackground.rectTransform, 0f);

            var revealGlow = PhoneUiFactory.CreateImage(revealBackground.transform, "RevealGlow", new Color(accent.r, accent.g, accent.b, 0.2f), PhoneUiFactory.CircleSprite);
            PhoneUiFactory.SetRect(revealGlow.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(160f, 160f), new Vector2(32f, 0f));
            revealGlow.preserveAspect = true;

            var hintText = PhoneUiFactory.CreateText(revealBackground.transform, "HintText", hint, 18, TextAnchor.UpperLeft, new Color(0.25f, 0.16f, 0.21f, 0.8f));
            PhoneUiFactory.SetRect(hintText.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-26f, 22f), new Vector2(14f, -12f));

            var codeLabel = PhoneUiFactory.CreateText(revealBackground.transform, "CodeLabel", code, 28, TextAnchor.MiddleLeft, new Color(0.16f, 0.08f, 0.14f), FontStyle.Bold);
            PhoneUiFactory.SetRect(codeLabel.rectTransform, new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(0f, 0f), new Vector2(-26f, 36f), new Vector2(14f, 18f));

            var dragHint = PhoneUiFactory.CreateText(revealBackground.transform, "DragHint", "Scratch the silver layer", 16, TextAnchor.UpperRight, new Color(0.35f, 0.18f, 0.3f, 0.64f), FontStyle.Bold);
            PhoneUiFactory.SetRect(dragHint.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-26f, 18f), new Vector2(-14f, -14f));

            var overlay = PhoneUiFactory.CreateRawImage(scratchArea, "ScratchOverlay", Color.white);
            PhoneUiFactory.Stretch(overlay.rectTransform, 0f);
            overlay.raycastTarget = true;

            var scratchCard = overlay.gameObject.AddComponent<ScratchTicketCard>();
            scratchCard.Initialize(overlay, scratchArea);
        }

        private void CreateStoreRow(Transform parent, float yPosition, string title, string subtitle, Color color)
        {
            var row = PhoneUiFactory.CreateImage(parent, $"{title}Row", new Color(1f, 1f, 1f, 0.9f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(row.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0.5f, 1f), new Vector2(-56f, 78f), new Vector2(0f, yPosition));
            PhoneUiFactory.AddSoftShadow(row.gameObject, new Color(0f, 0f, 0f, 0.06f), new Vector2(0f, -4f));

            var icon = PhoneUiFactory.CreateImage(row.transform, "Icon", color, PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(icon.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(54f, 54f), new Vector2(16f, 0f));
            var iconGlyph = PhoneUiFactory.CreateText(icon.transform, "IconGlyph", title.Length >= 2 ? title.Substring(0, 2).ToUpperInvariant() : title.ToUpperInvariant(), 18, TextAnchor.MiddleCenter, Color.white, FontStyle.Bold);
            PhoneUiFactory.Stretch(iconGlyph.rectTransform, 0f);

            var titleText = PhoneUiFactory.CreateText(row.transform, "Title", title, 22, TextAnchor.UpperLeft, new Color(0.09f, 0.1f, 0.14f), FontStyle.Bold);
            PhoneUiFactory.SetRect(titleText.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, 1f), new Vector2(-178f, 24f), new Vector2(84f, -16f));

            var subtitleText = PhoneUiFactory.CreateText(row.transform, "Subtitle", subtitle, 17, TextAnchor.UpperLeft, new Color(0.24f, 0.26f, 0.31f, 0.74f));
            PhoneUiFactory.SetRect(subtitleText.rectTransform, new Vector2(0f, 0f), new Vector2(1f, 1f), new Vector2(0f, 0f), new Vector2(-178f, -34f), new Vector2(84f, 12f));

            var getButton = PhoneUiFactory.CreateButton(row.transform, "GetButton", new Color(0.91f, 0.95f, 1f), "GET", 18, out var label);
            PhoneUiFactory.SetRect(getButton.GetComponent<RectTransform>(), new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(92f, 40f), new Vector2(-18f, 0f));
            label.color = new Color(0.17f, 0.42f, 1f, 0.96f);
        }

        private GameObject CreateAppIcon(Transform parent, string title, string glyph, Color color, UnityEngine.Events.UnityAction onClick = null)
        {
            var button = new GameObject($"{title}Icon", typeof(RectTransform), typeof(Image), typeof(Button)).GetComponent<Button>();
            button.transform.SetParent(parent, false);
            var buttonRect = button.GetComponent<RectTransform>();
            button.GetComponent<Image>().color = new Color(1f, 1f, 1f, 0f);

            var badge = PhoneUiFactory.CreateImage(button.transform, "Badge", color, PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(badge.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(90f, 90f), new Vector2(0f, -4f));
            PhoneUiFactory.AddSoftShadow(badge.gameObject, new Color(0f, 0f, 0f, 0.14f), new Vector2(0f, -6f));

            var glyphText = PhoneUiFactory.CreateText(badge.transform, "Glyph", glyph, glyph.Length > 3 ? 20 : 28, TextAnchor.MiddleCenter, Color.white, FontStyle.Bold);
            PhoneUiFactory.Stretch(glyphText.rectTransform, 0f);

            var caption = PhoneUiFactory.CreateText(button.transform, "Caption", title, 18, TextAnchor.LowerCenter, Color.white);
            PhoneUiFactory.SetRect(caption.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(120f, 26f), new Vector2(0f, 8f));

            if (onClick != null)
            {
                PhoneUiFactory.Hook(button, onClick);
            }

            return button.gameObject;
        }

        private CanvasGroup CreateScreenRoot(Transform parent, string name)
        {
            var rect = new GameObject(name, typeof(RectTransform), typeof(CanvasGroup)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            PhoneUiFactory.Stretch(rect, 0f);
            return rect.GetComponent<CanvasGroup>();
        }

        private void BuildWallpaper(Transform parent, Color baseColor, Color glowA, Color glowB)
        {
            var background = PhoneUiFactory.CreateImage(parent, "WallpaperBase", baseColor);
            PhoneUiFactory.Stretch(background.rectTransform, 0f);

            var glowOne = PhoneUiFactory.CreateImage(parent, "GlowOne", glowA, PhoneUiFactory.CircleSprite);
            PhoneUiFactory.SetRect(glowOne.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(440f, 440f), new Vector2(-60f, 80f));
            glowOne.preserveAspect = true;

            var glowTwo = PhoneUiFactory.CreateImage(parent, "GlowTwo", glowB, PhoneUiFactory.CircleSprite);
            PhoneUiFactory.SetRect(glowTwo.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(420f, 420f), new Vector2(78f, -36f));
            glowTwo.preserveAspect = true;

            var glowThree = PhoneUiFactory.CreateImage(parent, "GlowThree", new Color(1f, 1f, 1f, 0.08f), PhoneUiFactory.CircleSprite);
            PhoneUiFactory.SetRect(glowThree.rectTransform, new Vector2(0.5f, 0.3f), new Vector2(0.5f, 0.3f), new Vector2(0.5f, 0.5f), new Vector2(540f, 540f), new Vector2(0f, -60f));
            glowThree.preserveAspect = true;

            var glassBand = PhoneUiFactory.CreateImage(parent, "GlassBand", new Color(1f, 1f, 1f, 0.03f), PhoneUiFactory.RoundedSprite, true);
            PhoneUiFactory.SetRect(glassBand.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(520f, 320f), new Vector2(0f, -90f));
        }

        private void BuildStatusBar(Transform parent, Color textColor, Color secondaryColor, bool condensed)
        {
            var bar = PhoneUiFactory.CreateRect(parent, "StatusBar");
            PhoneUiFactory.SetRect(bar, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0.5f, 1f), new Vector2(-40f, 34f), new Vector2(0f, -18f));

            var timeText = PhoneUiFactory.CreateText(bar, "Time", "9:41", condensed ? 18 : 17, TextAnchor.MiddleLeft, textColor, FontStyle.Bold);
            PhoneUiFactory.SetRect(timeText.rectTransform, new Vector2(0f, 0f), new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(90f, 0f), new Vector2(14f, 0f));
            statusClockTexts.Add(timeText);

            var rightText = PhoneUiFactory.CreateText(bar, "BatteryText", "5G   87%", condensed ? 17 : 16, TextAnchor.MiddleRight, secondaryColor, FontStyle.Bold);
            PhoneUiFactory.SetRect(rightText.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 1f), new Vector2(1f, 0.5f), new Vector2(130f, 0f), new Vector2(-12f, 0f));
        }

        private void OnUnlockSliderChanged(float value)
        {
            if (unlockLabel == null)
            {
                return;
            }

            var alpha = Mathf.Lerp(0.88f, 0.18f, value);
            unlockLabel.color = new Color(1f, 1f, 1f, alpha);

            if (value >= 0.97f)
            {
                UnlockPhone();
            }
        }

        private void UpdateUnlockSlider()
        {
            if (activeScreen != lockScreenGroup || unlockSlider == null)
            {
                return;
            }

            if (!Input.GetMouseButton(0) && unlockSlider.value > 0f && unlockSlider.value < 0.97f)
            {
                unlockSlider.SetValueWithoutNotify(Mathf.MoveTowards(unlockSlider.value, 0f, Time.unscaledDeltaTime * 1.8f));
                OnUnlockSliderChanged(unlockSlider.value);
            }
        }

        private void UnlockPhone()
        {
            if (unlockTriggered)
            {
                return;
            }

            unlockTriggered = true;
            unlockSlider.interactable = false;
            unlockSlider.SetValueWithoutNotify(1f);
            TransitionTo(homeScreenGroup);
        }

        private void OpenAppStore()
        {
            TransitionTo(appStoreGroup);
        }

        private void OpenGame()
        {
            TransitionTo(gameGroup);
        }

        private void ReturnToHome()
        {
            if (activeScreen == lockScreenGroup)
            {
                return;
            }

            TransitionTo(homeScreenGroup);
        }

        private void StartDownloadOrOpen()
        {
            if (appInstalled)
            {
                OpenGame();
                return;
            }

            if (isDownloading)
            {
                return;
            }

            if (downloadRoutine != null)
            {
                StopCoroutine(downloadRoutine);
            }

            downloadRoutine = StartCoroutine(DownloadRoutine());
        }

        private IEnumerator DownloadRoutine()
        {
            isDownloading = true;
            downloadProgress = 0f;
            UpdateDownloadButtonVisual();

            while (downloadProgress < 1f)
            {
                downloadProgress += Time.unscaledDeltaTime / DownloadDuration;
                UpdateDownloadButtonVisual();
                yield return null;
            }

            downloadProgress = 1f;
            appInstalled = true;
            isDownloading = false;
            if (installIconRoot != null)
            {
                installIconRoot.gameObject.SetActive(true);
            }

            UpdateDownloadButtonVisual();
            yield return new WaitForSecondsRealtime(0.45f);
            OpenGame();
            downloadRoutine = null;
        }

        private void UpdateDownloadButtonVisual()
        {
            if (featuredAppButton == null || featuredAppButtonLabel == null)
            {
                return;
            }

            featuredAppButton.GetComponent<Image>().color = appInstalled
                ? new Color(0.17f, 0.42f, 1f, 1f)
                : new Color(0.17f, 0.42f, 1f, 1f);

            if (appInstalled)
            {
                featuredAppButtonLabel.gameObject.SetActive(true);
                featuredAppButtonLabel.text = "OPEN";
                featuredDownloadTrack.gameObject.SetActive(false);
                featuredDownloadFill.gameObject.SetActive(false);
                featuredDownloadStop.gameObject.SetActive(false);
                return;
            }

            if (!isDownloading)
            {
                featuredAppButtonLabel.gameObject.SetActive(true);
                featuredAppButtonLabel.text = "GET";
                featuredDownloadTrack.gameObject.SetActive(false);
                featuredDownloadFill.gameObject.SetActive(false);
                featuredDownloadStop.gameObject.SetActive(false);
                return;
            }

            featuredAppButtonLabel.gameObject.SetActive(false);
            featuredDownloadTrack.gameObject.SetActive(true);
            featuredDownloadFill.gameObject.SetActive(true);
            featuredDownloadStop.gameObject.SetActive(true);
            featuredDownloadFill.fillAmount = Mathf.Clamp01(downloadProgress);
        }

        private void UpdateHomePaging()
        {
            if (homeScrollRect == null || homePages == null || homePages.Length == 0)
            {
                return;
            }

            var currentPage = homeScrollRect.horizontalNormalizedPosition * (HomePageCount - 1);
            if (activeScreen == homeScreenGroup && !Input.GetMouseButton(0))
            {
                var snappedPage = Mathf.Round(currentPage);
                var target = HomePageCount <= 1 ? 0f : snappedPage / (HomePageCount - 1f);
                homeScrollRect.horizontalNormalizedPosition = Mathf.Lerp(
                    homeScrollRect.horizontalNormalizedPosition,
                    target,
                    1f - Mathf.Exp(-10f * Time.unscaledDeltaTime));
                currentPage = homeScrollRect.horizontalNormalizedPosition * (HomePageCount - 1);
            }

            for (var i = 0; i < pageDots.Length; i++)
            {
                var distance = Mathf.Abs(currentPage - i);
                var alpha = Mathf.Lerp(1f, 0.28f, Mathf.Clamp01(distance));
                pageDots[i].color = new Color(1f, 1f, 1f, alpha);
                var scale = Mathf.Lerp(1.2f, 1f, Mathf.Clamp01(distance));
                pageDots[i].rectTransform.localScale = Vector3.one * scale;
            }
        }

        private void RefreshHomeLayoutIfNeeded()
        {
            if (homeViewport == null || homeContent == null || homePages == null)
            {
                return;
            }

            var viewportSize = homeViewport.rect.size;
            if ((viewportSize - lastViewportSize).sqrMagnitude < 0.01f)
            {
                return;
            }

            lastViewportSize = viewportSize;
            homeContent.sizeDelta = new Vector2(viewportSize.x * HomePageCount, 0f);

            for (var i = 0; i < homePages.Length; i++)
            {
                var page = homePages[i];
                page.anchorMin = new Vector2(0f, 0f);
                page.anchorMax = new Vector2(0f, 1f);
                page.pivot = new Vector2(0f, 0.5f);
                page.sizeDelta = new Vector2(viewportSize.x, 0f);
                page.anchoredPosition = new Vector2(i * viewportSize.x, 0f);

                var grid = page.GetComponent<GridLayoutGroup>();
                if (grid != null)
                {
                    var cellWidth = Mathf.Floor((viewportSize.x - 48f - (grid.spacing.x * 3f)) / 4f);
                    grid.cellSize = new Vector2(cellWidth, Mathf.Min(cellWidth + 32f, 144f));
                    grid.padding = new RectOffset(6, 6, 12, 12);
                }
            }
        }

        private void UpdateClockLabels()
        {
            var timeString = DateTime.Now.ToString("h:mm");
            for (var i = 0; i < statusClockTexts.Count; i++)
            {
                if (statusClockTexts[i] != null)
                {
                    statusClockTexts[i].text = timeString;
                }
            }

            if (lockTimeText != null)
            {
                lockTimeText.text = DateTime.Now.ToString("h:mm");
            }

            if (lockDateText != null)
            {
                lockDateText.text = DateTime.Now.ToString("dddd, MMMM d");
            }
        }

        private void ShowScreenImmediately(CanvasGroup screen)
        {
            activeScreen = screen;
            PhoneUiFactory.SetCanvasGroup(lockScreenGroup, screen == lockScreenGroup);
            PhoneUiFactory.SetCanvasGroup(homeScreenGroup, screen == homeScreenGroup);
            PhoneUiFactory.SetCanvasGroup(appStoreGroup, screen == appStoreGroup);
            PhoneUiFactory.SetCanvasGroup(gameGroup, screen == gameGroup);
        }

        private void TransitionTo(CanvasGroup target)
        {
            if (target == null || target == activeScreen)
            {
                return;
            }

            if (screenTransitionRoutine != null)
            {
                StopCoroutine(screenTransitionRoutine);
            }

            screenTransitionRoutine = StartCoroutine(TransitionRoutine(activeScreen, target));
        }

        private IEnumerator TransitionRoutine(CanvasGroup from, CanvasGroup to)
        {
            if (to != null)
            {
                to.gameObject.SetActive(true);
                to.alpha = 0f;
                to.interactable = false;
                to.blocksRaycasts = false;
            }

            var elapsed = 0f;
            while (elapsed < TransitionDuration)
            {
                elapsed += Time.unscaledDeltaTime;
                var t = Mathf.Clamp01(elapsed / TransitionDuration);
                var eased = 1f - Mathf.Pow(1f - t, 3f);

                if (from != null)
                {
                    from.alpha = 1f - eased;
                }

                if (to != null)
                {
                    to.alpha = eased;
                }

                yield return null;
            }

            if (from != null)
            {
                from.alpha = 0f;
                from.interactable = false;
                from.blocksRaycasts = false;
                from.gameObject.SetActive(false);
            }

            if (to != null)
            {
                to.alpha = 1f;
                to.interactable = true;
                to.blocksRaycasts = true;
                activeScreen = to;
            }

            screenTransitionRoutine = null;
        }

        private void EnsureEventSystem()
        {
            if (FindFirstObjectByType<EventSystem>() != null)
            {
                return;
            }

            var eventSystemObject = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            DontDestroyOnLoad(eventSystemObject);
        }

        private void ForceInteractiveInput()
        {
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;

            inputRefreshTimer -= Time.unscaledDeltaTime;
            if (inputRefreshTimer > 0f)
            {
                return;
            }

            inputRefreshTimer = 0.25f;

            var mouseLooks = FindObjectsByType<MouseLook>(FindObjectsSortMode.None);
            for (var i = 0; i < mouseLooks.Length; i++)
            {
                if (mouseLooks[i] != null)
                {
                    mouseLooks[i].enabled = false;
                }
            }

            var swimmers = FindObjectsByType<SwimController>(FindObjectsSortMode.None);
            for (var i = 0; i < swimmers.Length; i++)
            {
                if (swimmers[i] != null)
                {
                    swimmers[i].enabled = false;
                }
            }
        }
    }
}
