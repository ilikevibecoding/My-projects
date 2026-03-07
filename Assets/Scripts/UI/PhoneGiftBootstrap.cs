using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

public class PhoneGiftBootstrap : MonoBehaviour
{
    private enum ExperienceScreen
    {
        Lock,
        Home,
        Store,
        Game
    }

    private struct AppIconDefinition
    {
        public string Label;
        public string Monogram;
        public Color Primary;
        public Color Secondary;
        public Action OnPressed;

        public AppIconDefinition(string label, string monogram, Color primary, Color secondary, Action onPressed)
        {
            Label = label;
            Monogram = monogram;
            Primary = primary;
            Secondary = secondary;
            OnPressed = onPressed;
        }
    }

    private const float PhoneWidth = 590f;
    private const float PhoneHeight = 1210f;
    private const float ScreenInset = 18f;

    private Font uiFont;
    private Sprite roundedSprite;
    private Sprite pillSprite;
    private Sprite circleSprite;
    private Sprite wallpaperSprite;
    private Sprite backdropSprite;
    private Sprite appStoreBackdropSprite;
    private Sprite scratchBackdropSprite;

    private readonly List<Text> statusTimeTexts = new List<Text>();
    private readonly List<Image> pageDots = new List<Image>();
    private readonly List<ScratchTicketController> scratchTickets = new List<ScratchTicketController>();

    private GameObject lockScreen;
    private GameObject homeScreen;
    private GameObject appStoreScreen;
    private GameObject gameScreen;
    private GameObject homeIndicator;

    private Text lockClockText;
    private Text lockDateText;
    private Button evaDownloadButton;
    private Text evaDownloadButtonText;
    private Text evaDownloadButtonGlyph;
    private Image evaDownloadProgressFill;
    private HomePagerController homePager;

    private bool evaGameDownloaded;
    private bool evaGameDownloading;
    private ExperienceScreen currentScreen;
    private Coroutine screenTransition;

    private void Awake()
    {
        Application.targetFrameRate = 120;
        QualitySettings.vSyncCount = 0;

        uiFont = LoadBuiltinFont();
        roundedSprite = CreateRoundedSprite(128, 128, 28);
        pillSprite = CreateRoundedSprite(256, 128, 64);
        circleSprite = CreateRoundedSprite(128, 128, 64);
        wallpaperSprite = CreateWallpaperSprite(384, 768);
        backdropSprite = CreateBackdropSprite(512, 1024);
        appStoreBackdropSprite = CreateGradientSprite(new Color(0.98f, 0.93f, 0.96f), new Color(0.92f, 0.96f, 1f));
        scratchBackdropSprite = CreateGradientSprite(new Color(1f, 0.97f, 0.98f), new Color(0.95f, 0.92f, 1f));

        EnsureEventSystem();
        BuildUi();
        RefreshClock();
        UpdateDownloadButtonVisuals();
        ShowScreen(ExperienceScreen.Lock, true);
        StartCoroutine(ClockRoutine());
    }

    private void EnsureEventSystem()
    {
        if (UnityEngine.Object.FindFirstObjectByType<EventSystem>() != null)
        {
            return;
        }

        var eventSystem = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
        DontDestroyOnLoad(eventSystem);
    }

    private void BuildUi()
    {
        var canvasObject = new GameObject("Eva Gift Phone Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        var canvas = canvasObject.GetComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.pixelPerfect = false;

        var scaler = canvasObject.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1440f, 3040f);
        scaler.matchWidthOrHeight = 0.55f;

        var backdrop = CreateImage("Backdrop", canvasObject.transform, backdropSprite, Color.white);
        Stretch(backdrop.rectTransform);
        backdrop.rectTransform.SetAsFirstSibling();

        CreateAmbientGlow(canvasObject.transform, new Vector2(-360f, 720f), new Vector2(920f, 920f), new Color(0.95f, 0.32f, 0.60f, 0.20f));
        CreateAmbientGlow(canvasObject.transform, new Vector2(360f, -580f), new Vector2(760f, 760f), new Color(0.30f, 0.56f, 1f, 0.20f));
        CreateAmbientGlow(canvasObject.transform, new Vector2(0f, 0f), new Vector2(1220f, 1220f), new Color(1f, 1f, 1f, 0.04f));

        var shadow = CreateImage("Phone Shadow", canvasObject.transform, roundedSprite, new Color(0f, 0f, 0f, 0.48f));
        ConfigureSlicedImage(shadow);
        SetCentered(shadow.rectTransform, PhoneWidth + 34f, PhoneHeight + 52f, 0f, -24f);
        shadow.rectTransform.localScale = new Vector3(1.02f, 1.02f, 1f);

        var shell = CreateImage("Phone Shell", canvasObject.transform, roundedSprite, new Color(0.05f, 0.05f, 0.07f, 1f));
        ConfigureSlicedImage(shell);
        SetCentered(shell.rectTransform, PhoneWidth, PhoneHeight, 0f, 0f);

        var bezel = CreateImage("Bezel", shell.transform, roundedSprite, new Color(0.10f, 0.10f, 0.12f, 1f));
        ConfigureSlicedImage(bezel);
        Stretch(bezel.rectTransform, 8f, 8f, 8f, 8f);

        var screenMask = CreateImage("Screen Mask", bezel.transform, roundedSprite, Color.black);
        ConfigureSlicedImage(screenMask);
        Stretch(screenMask.rectTransform, ScreenInset, ScreenInset, ScreenInset, ScreenInset);
        var mask = screenMask.gameObject.AddComponent<Mask>();
        mask.showMaskGraphic = true;

        var screenRoot = CreateRect("Screen Root", screenMask.transform);
        Stretch(screenRoot);

        lockScreen = CreateScreenLayer("Lock Screen", screenRoot);
        homeScreen = CreateScreenLayer("Home Screen", screenRoot);
        appStoreScreen = CreateScreenLayer("App Store Screen", screenRoot);
        gameScreen = CreateScreenLayer("Game Screen", screenRoot);

        BuildLockScreen(lockScreen.transform);
        BuildHomeScreen(homeScreen.transform);
        BuildAppStoreScreen(appStoreScreen.transform);
        BuildGameScreen(gameScreen.transform);

        var island = CreateImage("Dynamic Island", screenMask.transform, pillSprite, new Color(0.02f, 0.02f, 0.03f, 1f));
        ConfigureSlicedImage(island);
        SetAnchor(island.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(176f, 42f), new Vector2(0f, -24f));
        island.rectTransform.SetAsLastSibling();

        var lens = CreateImage("Lens", island.transform, circleSprite, new Color(0.13f, 0.16f, 0.18f, 1f));
        SetAnchor(lens.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(18f, 18f), new Vector2(-20f, 0f));

        homeIndicator = CreateImage("Home Indicator", screenMask.transform, pillSprite, new Color(1f, 1f, 1f, 0.90f)).gameObject;
        var indicatorRect = homeIndicator.GetComponent<RectTransform>();
        SetAnchor(indicatorRect, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(168f, 10f), new Vector2(0f, 12f));
        var indicatorImage = homeIndicator.GetComponent<Image>();
        ConfigureSlicedImage(indicatorImage);
        indicatorImage.raycastTarget = true;
        var indicatorButton = homeIndicator.AddComponent<Button>();
        indicatorButton.transition = Selectable.Transition.None;
        indicatorButton.onClick.AddListener(() =>
        {
            if (currentScreen != ExperienceScreen.Lock)
            {
                ShowScreen(ExperienceScreen.Home);
            }
        });

        screenMask.rectTransform.SetAsLastSibling();
        homeIndicator.transform.SetAsLastSibling();
    }

    private void BuildLockScreen(Transform parent)
    {
        BuildPhoneWallpaper(parent, 0.18f);
        BuildStatusBar(parent, Color.white);

        var headerChip = CreateImage("Header Chip", parent, pillSprite, new Color(1f, 1f, 1f, 0.16f));
        ConfigureSlicedImage(headerChip);
        SetAnchor(headerChip.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(170f, 42f), new Vector2(0f, -132f));
        AddShadow(headerChip, new Color(0f, 0f, 0f, 0.18f), new Vector2(0f, -4f));

        var chipText = CreateText("Chip Label", headerChip.transform, "FOR EVA", 18, Color.white, FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(chipText.rectTransform);

        lockClockText = CreateText("Lock Clock", parent, "9:41", 108, Color.white, FontStyle.Bold, TextAnchor.MiddleCenter);
        SetAnchor(lockClockText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(340f, 120f), new Vector2(0f, -242f));
        AddShadow(lockClockText, new Color(0f, 0f, 0f, 0.22f), new Vector2(0f, -6f));

        lockDateText = CreateText("Lock Date", parent, "Saturday, March 7", 24, new Color(1f, 1f, 1f, 0.92f), FontStyle.Normal, TextAnchor.MiddleCenter);
        SetAnchor(lockDateText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(400f, 34f), new Vector2(0f, -324f));

        var messageCard = CreateImage("Message Card", parent, roundedSprite, new Color(1f, 1f, 1f, 0.16f));
        ConfigureSlicedImage(messageCard);
        SetAnchor(messageCard.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(470f, 124f), new Vector2(0f, 92f));
        AddShadow(messageCard, new Color(0f, 0f, 0f, 0.20f), new Vector2(0f, -8f));

        var messageTitle = CreateText("Message Title", messageCard.transform, "A little surprise is waiting inside.", 24, Color.white, FontStyle.Bold, TextAnchor.UpperLeft);
        SetAnchor(messageTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(410f, 30f), new Vector2(28f, -22f));

        var messageSubtitle = CreateText("Message Subtitle", messageCard.transform, "Slide to unlock, open the App Store, and grab Eva's Game.", 18, new Color(1f, 1f, 1f, 0.86f), FontStyle.Normal, TextAnchor.UpperLeft);
        SetAnchor(messageSubtitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(414f, 58f), new Vector2(28f, -58f));

        var unlockTrack = CreateImage("Unlock Track", parent, pillSprite, new Color(1f, 1f, 1f, 0.16f));
        ConfigureSlicedImage(unlockTrack);
        SetAnchor(unlockTrack.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(450f, 86f), new Vector2(0f, 118f));
        AddShadow(unlockTrack, new Color(0f, 0f, 0f, 0.20f), new Vector2(0f, -8f));

        var unlockFill = CreateImage("Unlock Fill", unlockTrack.transform, pillSprite, new Color(1f, 1f, 1f, 0.26f));
        ConfigureSlicedImage(unlockFill);
        unlockFill.rectTransform.anchorMin = new Vector2(0f, 0f);
        unlockFill.rectTransform.anchorMax = new Vector2(0f, 1f);
        unlockFill.rectTransform.pivot = new Vector2(0f, 0.5f);
        unlockFill.rectTransform.sizeDelta = new Vector2(70f, 0f);
        unlockFill.rectTransform.anchoredPosition = Vector2.zero;

        var unlockLabel = CreateText("Unlock Label", unlockTrack.transform, "slide to unlock", 24, new Color(1f, 1f, 1f, 0.92f), FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(unlockLabel.rectTransform);

        var unlockKnob = CreateImage("Unlock Knob", unlockTrack.transform, circleSprite, Color.white);
        SetAnchor(unlockKnob.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(70f, 70f), new Vector2(8f, 0f));
        AddShadow(unlockKnob, new Color(0f, 0f, 0f, 0.18f), new Vector2(0f, -4f));

        var unlockArrow = CreateText("Unlock Arrow", unlockKnob.transform, ">", 30, new Color(0.18f, 0.20f, 0.28f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(unlockArrow.rectTransform);

        var unlockControl = unlockTrack.gameObject.AddComponent<SlideUnlockControl>();
        unlockControl.Initialize(unlockTrack.rectTransform, unlockKnob.rectTransform, unlockFill.rectTransform, unlockLabel, () =>
        {
            ShowScreen(ExperienceScreen.Home);
        });
    }

    private void BuildHomeScreen(Transform parent)
    {
        BuildPhoneWallpaper(parent, 0.12f);
        BuildStatusBar(parent, Color.white);

        var hint = CreateText("Hint", parent, "Swipe across the pages and tap the App Store.", 22, new Color(1f, 1f, 1f, 0.92f), FontStyle.Bold, TextAnchor.MiddleCenter);
        SetAnchor(hint.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(470f, 34f), new Vector2(0f, -102f));

        var pageViewport = CreateRect("Page Viewport", parent);
        SetAnchor(pageViewport, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(504f, 754f), new Vector2(0f, -160f));
        var viewportTarget = pageViewport.gameObject.AddComponent<Image>();
        viewportTarget.color = new Color(1f, 1f, 1f, 0.001f);
        viewportTarget.raycastTarget = true;

        var pages = CreateRect("Pages", pageViewport);
        pages.anchorMin = new Vector2(0f, 1f);
        pages.anchorMax = new Vector2(0f, 1f);
        pages.pivot = new Vector2(0f, 1f);
        pages.sizeDelta = new Vector2(1008f, 754f);
        pages.anchoredPosition = Vector2.zero;

        var firstPage = CreateRect("First Page", pages);
        firstPage.anchorMin = new Vector2(0f, 1f);
        firstPage.anchorMax = new Vector2(0f, 1f);
        firstPage.pivot = new Vector2(0f, 1f);
        firstPage.sizeDelta = new Vector2(504f, 754f);
        firstPage.anchoredPosition = Vector2.zero;

        var secondPage = CreateRect("Second Page", pages);
        secondPage.anchorMin = new Vector2(0f, 1f);
        secondPage.anchorMax = new Vector2(0f, 1f);
        secondPage.pivot = new Vector2(0f, 1f);
        secondPage.sizeDelta = new Vector2(504f, 754f);
        secondPage.anchoredPosition = new Vector2(504f, 0f);

        homePager = pageViewport.gameObject.AddComponent<HomePagerController>();
        homePager.Initialize(pageViewport, pages, 2, UpdatePageDots);

        var pageOneApps = new AppIconDefinition[]
        {
            new AppIconDefinition("Messages", "MSG", new Color(0.26f, 0.82f, 0.36f), new Color(0.18f, 0.68f, 0.28f), null),
            new AppIconDefinition("Calendar", "7", new Color(1f, 1f, 1f), new Color(0.97f, 0.23f, 0.28f), null),
            new AppIconDefinition("Photos", "PH", new Color(1f, 1f, 1f), new Color(0.94f, 0.42f, 0.20f), null),
            new AppIconDefinition("Camera", "CAM", new Color(0.28f, 0.29f, 0.33f), new Color(0.80f, 0.82f, 0.87f), null),
            new AppIconDefinition("Mail", "M", new Color(0.18f, 0.54f, 1f), new Color(0.14f, 0.45f, 0.92f), null),
            new AppIconDefinition("Maps", "MAP", new Color(1f, 1f, 1f), new Color(0.12f, 0.76f, 0.40f), null),
            new AppIconDefinition("Clock", "CLK", new Color(0.16f, 0.17f, 0.20f), new Color(1f, 1f, 1f), null),
            new AppIconDefinition("Weather", "SUN", new Color(0.33f, 0.67f, 1f), new Color(1f, 0.82f, 0.22f), null),
            new AppIconDefinition("Notes", "N", new Color(1f, 0.96f, 0.56f), new Color(1f, 0.82f, 0.12f), null),
            new AppIconDefinition("Health", "H", new Color(1f, 0.30f, 0.48f), new Color(1f, 0.18f, 0.38f), null),
            new AppIconDefinition("Music", "MU", new Color(1f, 0.22f, 0.45f), new Color(0.94f, 0.16f, 0.40f), null),
            new AppIconDefinition("App Store", "A", new Color(0.16f, 0.55f, 1f), new Color(0.12f, 0.46f, 0.92f), () => ShowScreen(ExperienceScreen.Store)),
            new AppIconDefinition("TV", "TV", new Color(0.12f, 0.12f, 0.16f), new Color(0.98f, 0.98f, 0.98f), null),
            new AppIconDefinition("Wallet", "W", new Color(0.18f, 0.18f, 0.22f), new Color(0.38f, 0.75f, 0.52f), null),
            new AppIconDefinition("Settings", "S", new Color(0.56f, 0.60f, 0.66f), new Color(0.43f, 0.46f, 0.52f), null),
            new AppIconDefinition("Photos+", "P+", new Color(0.94f, 0.58f, 0.18f), new Color(0.96f, 0.28f, 0.62f), null)
        };

        var pageTwoApps = new AppIconDefinition[]
        {
            new AppIconDefinition("TikTok", "TT", new Color(0.10f, 0.10f, 0.12f), new Color(0.22f, 0.88f, 0.88f), null),
            new AppIconDefinition("Cooking 1", "C1", new Color(1f, 0.54f, 0.26f), new Color(1f, 0.42f, 0.18f), null),
            new AppIconDefinition("Cooking 2", "C2", new Color(0.98f, 0.72f, 0.18f), new Color(0.96f, 0.58f, 0.14f), null),
            new AppIconDefinition("Cooking 3", "C3", new Color(0.35f, 0.82f, 0.58f), new Color(0.22f, 0.68f, 0.44f), null),
            new AppIconDefinition("Cafe", "CF", new Color(0.62f, 0.42f, 0.26f), new Color(0.50f, 0.34f, 0.20f), null),
            new AppIconDefinition("Dreamboard", "DB", new Color(0.86f, 0.42f, 0.82f), new Color(0.74f, 0.30f, 0.70f), null),
            new AppIconDefinition("Camera Roll", "CR", new Color(0.24f, 0.24f, 0.30f), new Color(0.82f, 0.84f, 0.90f), null),
            new AppIconDefinition("Games", "GG", new Color(0.26f, 0.58f, 1f), new Color(0.16f, 0.48f, 0.92f), null)
        };

        BuildAppGrid(firstPage, pageOneApps);
        BuildAppGrid(secondPage, pageTwoApps);

        var dotsRoot = CreateRect("Page Dots", parent);
        SetAnchor(dotsRoot, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(100f, 24f), new Vector2(0f, 206f));

        for (var index = 0; index < 2; index++)
        {
            var dot = CreateImage("Dot " + index, dotsRoot, circleSprite, index == 0 ? Color.white : new Color(1f, 1f, 1f, 0.35f));
            SetAnchor(dot.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(12f, 12f), new Vector2(index == 0 ? -14f : 14f, 0f));
            pageDots.Add(dot);
        }

        var dock = CreateImage("Dock", parent, roundedSprite, new Color(1f, 1f, 1f, 0.17f));
        ConfigureSlicedImage(dock);
        SetAnchor(dock.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(508f, 112f), new Vector2(0f, 78f));
        AddShadow(dock, new Color(0f, 0f, 0f, 0.18f), new Vector2(0f, -8f));

        var dockApps = new AppIconDefinition[]
        {
            new AppIconDefinition("Phone", "PH", new Color(0.32f, 0.82f, 0.40f), new Color(0.20f, 0.68f, 0.28f), null),
            new AppIconDefinition("Safari", "SA", new Color(0.20f, 0.62f, 1f), new Color(1f, 0.36f, 0.42f), null),
            new AppIconDefinition("Music Dock", "MU", new Color(1f, 0.22f, 0.45f), new Color(0.92f, 0.16f, 0.38f), null),
            new AppIconDefinition("Camera Dock", "CM", new Color(0.32f, 0.34f, 0.39f), new Color(0.86f, 0.88f, 0.92f), null)
        };

        for (var index = 0; index < dockApps.Length; index++)
        {
            var xPosition = -186f + (index * 124f);
            var iconRoot = CreateRect("Dock Icon " + dockApps[index].Label, dock.transform);
            SetAnchor(iconRoot, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(92f, 92f), new Vector2(xPosition, 0f));
            BuildIconVisual(iconRoot, dockApps[index], false);
        }
    }

    private void BuildAppStoreScreen(Transform parent)
    {
        BuildSoftBackground(parent, appStoreBackdropSprite, new Color(1f, 1f, 1f, 0.28f));
        BuildStatusBar(parent, new Color(0.09f, 0.10f, 0.14f, 1f));

        var homeButton = CreatePillButton(parent, "<  Home", 118f, 38f, new Vector2(78f, -92f), new Color(0.11f, 0.12f, 0.18f, 0.10f), new Color(0.16f, 0.18f, 0.24f, 1f), FontStyle.Bold);
        homeButton.onClick.AddListener(() => ShowScreen(ExperienceScreen.Home));

        var title = CreateText("Store Title", parent, "Eva's Game", 54, new Color(0.10f, 0.12f, 0.18f, 1f), FontStyle.Bold, TextAnchor.UpperLeft);
        SetAnchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(420f, 64f), new Vector2(28f, -150f));

        var subtitle = CreateText("Store Subtitle", parent, "A tiny custom app with scratch-off surprises waiting inside.", 22, new Color(0.28f, 0.30f, 0.38f, 1f), FontStyle.Normal, TextAnchor.UpperLeft);
        SetAnchor(subtitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(474f, 56f), new Vector2(28f, -206f));

        var heroCard = CreateImage("Hero Card", parent, roundedSprite, Color.white);
        ConfigureSlicedImage(heroCard);
        SetAnchor(heroCard.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(500f, 286f), new Vector2(0f, -300f));
        AddShadow(heroCard, new Color(0f, 0f, 0f, 0.12f), new Vector2(0f, -12f));

        var heroGradient = CreateImage("Hero Gradient", heroCard.transform, CreateRoundedGradientSprite(new Color(1f, 0.76f, 0.84f), new Color(0.76f, 0.78f, 1f), 128, 128, 28), Color.white);
        Stretch(heroGradient.rectTransform, 0f, 0f, 0f, 0f);

        var heroIcon = CreateImage("Hero Icon", heroCard.transform, roundedSprite, new Color(0.17f, 0.55f, 1f, 1f));
        ConfigureSlicedImage(heroIcon);
        SetAnchor(heroIcon.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(96f, 96f), new Vector2(24f, -22f));
        CreateIconArt(heroIcon.rectTransform, "App Store", "A", Color.white);

        var heroTitle = CreateText("Hero Title", heroCard.transform, "Eva's Game", 32, new Color(0.11f, 0.13f, 0.18f, 1f), FontStyle.Bold, TextAnchor.UpperLeft);
        SetAnchor(heroTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(230f, 34f), new Vector2(136f, -28f));

        var heroGenre = CreateText("Hero Genre", heroCard.transform, "Lifestyle  •  Made with love", 18, new Color(0.30f, 0.32f, 0.40f, 1f), FontStyle.Normal, TextAnchor.UpperLeft);
        SetAnchor(heroGenre.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(240f, 26f), new Vector2(136f, -66f));

        evaDownloadButton = CreatePillButton(heroCard.transform, "GET", 126f, 54f, new Vector2(168f, -46f), new Color(0.12f, 0.48f, 1f, 1f), Color.white, FontStyle.Bold);
        evaDownloadButton.transform.SetParent(heroCard.transform, false);
        var buttonRect = evaDownloadButton.GetComponent<RectTransform>();
        buttonRect.anchorMin = new Vector2(1f, 1f);
        buttonRect.anchorMax = new Vector2(1f, 1f);
        buttonRect.pivot = new Vector2(1f, 1f);
        buttonRect.sizeDelta = new Vector2(126f, 54f);
        buttonRect.anchoredPosition = new Vector2(-24f, -26f);
        evaDownloadButton.onClick.AddListener(OnEvaDownloadPressed);

        var buttonGraphic = evaDownloadButton.GetComponent<Image>();
        evaDownloadButtonText = FindTextChild(evaDownloadButton.transform, "Button Label");

        evaDownloadButtonGlyph = CreateText("Download Glyph", evaDownloadButton.transform, "v", 22, Color.white, FontStyle.Bold, TextAnchor.MiddleCenter);
        SetAnchor(evaDownloadButtonGlyph.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(22f, 22f), new Vector2(18f, 0f));
        evaDownloadButtonGlyph.gameObject.SetActive(false);

        var progressTrack = CreateImage("Progress Track", evaDownloadButton.transform, pillSprite, new Color(1f, 1f, 1f, 0.20f));
        ConfigureSlicedImage(progressTrack);
        SetAnchor(progressTrack.rectTransform, new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(0f, 6f), new Vector2(0f, 8f));
        progressTrack.rectTransform.offsetMin = new Vector2(14f, 8f);
        progressTrack.rectTransform.offsetMax = new Vector2(-14f, 14f);
        progressTrack.gameObject.SetActive(false);

        evaDownloadProgressFill = CreateImage("Progress Fill", progressTrack.transform, pillSprite, Color.white);
        ConfigureSlicedImage(evaDownloadProgressFill);
        evaDownloadProgressFill.rectTransform.anchorMin = new Vector2(0f, 0f);
        evaDownloadProgressFill.rectTransform.anchorMax = new Vector2(0f, 1f);
        evaDownloadProgressFill.rectTransform.pivot = new Vector2(0f, 0.5f);
        evaDownloadProgressFill.rectTransform.sizeDelta = new Vector2(0f, 0f);
        evaDownloadProgressFill.rectTransform.anchoredPosition = Vector2.zero;

        var previewStrip = CreateImage("Preview Strip", heroCard.transform, roundedSprite, new Color(1f, 1f, 1f, 0.62f));
        ConfigureSlicedImage(previewStrip);
        SetAnchor(previewStrip.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(452f, 122f), new Vector2(0f, 24f));

        for (var index = 0; index < 3; index++)
        {
            var preview = CreateImage("Preview " + index, previewStrip.transform, roundedSprite, Color.white);
            ConfigureSlicedImage(preview);
            SetAnchor(preview.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(136f, 92f), new Vector2(18f + (index * 148f), 0f));
            preview.sprite = CreateRoundedGradientSprite(
                index == 0 ? new Color(1f, 0.86f, 0.92f) : (index == 1 ? new Color(0.89f, 0.89f, 1f) : new Color(1f, 0.95f, 0.84f)),
                index == 0 ? new Color(0.80f, 0.74f, 1f) : (index == 1 ? new Color(0.68f, 0.84f, 1f) : new Color(1f, 0.76f, 0.64f)),
                128,
                128,
                22);
            ConfigureSlicedImage(preview);

            var previewLabel = CreateText("Preview Label", preview.transform, index == 0 ? "Sweet UI" : (index == 1 ? "Download Magic" : "Scratch Tickets"), 18, new Color(0.12f, 0.14f, 0.20f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
            Stretch(previewLabel.rectTransform);
        }

        var favoritesTitle = CreateText("Favorites Title", parent, "Favorites for now", 28, new Color(0.12f, 0.14f, 0.20f, 1f), FontStyle.Bold, TextAnchor.UpperLeft);
        SetAnchor(favoritesTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(240f, 34f), new Vector2(28f, -616f));

        var favoritesPanel = CreateImage("Favorites Panel", parent, roundedSprite, new Color(1f, 1f, 1f, 0.92f));
        ConfigureSlicedImage(favoritesPanel);
        SetAnchor(favoritesPanel.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(500f, 292f), new Vector2(0f, -670f));
        AddShadow(favoritesPanel, new Color(0f, 0f, 0f, 0.08f), new Vector2(0f, -8f));

        CreateFavoriteRow(favoritesPanel.transform, 0, "Cooking Game 1", "Cozy recipes and tiny wins", new Color(1f, 0.62f, 0.32f));
        CreateFavoriteRow(favoritesPanel.transform, 1, "Cooking Game 2", "Fast kitchen chaos", new Color(0.98f, 0.76f, 0.20f));
        CreateFavoriteRow(favoritesPanel.transform, 2, "Cooking Game 3", "Desserts, colors, and combos", new Color(0.38f, 0.84f, 0.56f));
        CreateFavoriteRow(favoritesPanel.transform, 3, "TikTok", "For the scrolling breaks", new Color(0.12f, 0.12f, 0.16f));

        var footerNote = CreateImage("Footer Note", parent, roundedSprite, new Color(1f, 1f, 1f, 0.68f));
        ConfigureSlicedImage(footerNote);
        SetAnchor(footerNote.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(500f, 96f), new Vector2(0f, 80f));

        var footerText = CreateText("Footer Text", footerNote.transform, "Temporary favorites for now. Swap in Eva's real picks and Amazon rewards later.", 18, new Color(0.26f, 0.28f, 0.34f, 1f), FontStyle.Normal, TextAnchor.MiddleCenter);
        Stretch(footerText.rectTransform, 20f, 20f, 0f, 0f);
    }

    private void BuildGameScreen(Transform parent)
    {
        BuildSoftBackground(parent, scratchBackdropSprite, new Color(1f, 1f, 1f, 0.34f));
        BuildStatusBar(parent, new Color(0.12f, 0.12f, 0.18f, 1f));

        var backButton = CreatePillButton(parent, "<  App Store", 156f, 38f, new Vector2(98f, -92f), new Color(0.11f, 0.12f, 0.18f, 0.10f), new Color(0.14f, 0.16f, 0.22f, 1f), FontStyle.Bold);
        backButton.onClick.AddListener(() => ShowScreen(ExperienceScreen.Store));

        var title = CreateText("Game Title", parent, "Eva Scratchers", 50, new Color(0.12f, 0.12f, 0.18f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
        SetAnchor(title.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(420f, 56f), new Vector2(0f, -156f));

        var subtitle = CreateText("Game Subtitle", parent, "Scratch the silver foil and reveal the surprise underneath.", 22, new Color(0.28f, 0.30f, 0.38f, 1f), FontStyle.Normal, TextAnchor.MiddleCenter);
        SetAnchor(subtitle.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(500f, 52f), new Vector2(0f, -208f));

        var counterCard = CreateImage("Counter Card", parent, pillSprite, new Color(1f, 1f, 1f, 0.66f));
        ConfigureSlicedImage(counterCard);
        SetAnchor(counterCard.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(230f, 44f), new Vector2(0f, -268f));

        var counterText = CreateText("Counter Text", counterCard.transform, "3 scratchers waiting", 20, new Color(0.18f, 0.20f, 0.26f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(counterText.rectTransform);

        scratchTickets.Add(CreateScratchTicket(parent, new Vector2(0f, -388f), "Gift 01", "Stand Mixer Fund", "A placeholder code for a kitchen wishlist favorite.", "AMZN-MIXER-DREAM", new Color(1f, 0.80f, 0.86f), new Color(0.96f, 0.62f, 0.74f)));
        scratchTickets.Add(CreateScratchTicket(parent, new Vector2(0f, -606f), "Gift 02", "Cozy Night Bundle", "Blanket, candles, or anything warm and soft.", "AMZN-COZY-NIGHT", new Color(0.84f, 0.88f, 1f), new Color(0.70f, 0.76f, 1f)));
        scratchTickets.Add(CreateScratchTicket(parent, new Vector2(0f, -824f), "Gift 03", "Glow-Up Treat", "A placeholder beauty or self-care pick.", "AMZN-GLOW-UP-LOVE", new Color(1f, 0.92f, 0.78f), new Color(1f, 0.78f, 0.62f)));

        var note = CreateText("Scratcher Note", parent, "Temporary codes are filled in for now, so the layout is ready when you want the real Amazon picks.", 18, new Color(0.34f, 0.36f, 0.42f, 1f), FontStyle.Normal, TextAnchor.MiddleCenter);
        SetAnchor(note.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(500f, 60f), new Vector2(0f, 64f));
    }

    private ScratchTicketController CreateScratchTicket(Transform parent, Vector2 anchoredPosition, string badge, string title, string subtitle, string code, Color top, Color bottom)
    {
        var ticket = CreateImage("Scratch Ticket " + badge, parent, roundedSprite, Color.white);
        ticket.sprite = CreateRoundedGradientSprite(top, bottom, 128, 128, 28);
        ConfigureSlicedImage(ticket);
        SetAnchor(ticket.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(500f, 188f), anchoredPosition);
        AddShadow(ticket, new Color(0f, 0f, 0f, 0.10f), new Vector2(0f, -8f));

        var innerPanel = CreateImage("Inner Panel", ticket.transform, roundedSprite, new Color(1f, 1f, 1f, 0.20f));
        ConfigureSlicedImage(innerPanel);
        Stretch(innerPanel.rectTransform, 16f, 16f, 16f, 16f);

        var leftCut = CreateImage("Left Cutout", ticket.transform, circleSprite, Color.white);
        SetAnchor(leftCut.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(28f, 28f), new Vector2(-14f, 0f));
        leftCut.color = new Color(1f, 1f, 1f, 0.55f);

        var rightCut = CreateImage("Right Cutout", ticket.transform, circleSprite, Color.white);
        SetAnchor(rightCut.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(28f, 28f), new Vector2(14f, 0f));
        rightCut.color = new Color(1f, 1f, 1f, 0.55f);

        var badgePanel = CreateImage("Badge Panel", ticket.transform, pillSprite, new Color(1f, 1f, 1f, 0.36f));
        ConfigureSlicedImage(badgePanel);
        SetAnchor(badgePanel.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(92f, 32f), new Vector2(24f, -20f));

        var badgeText = CreateText("Badge Text", badgePanel.transform, badge, 16, new Color(0.18f, 0.20f, 0.26f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(badgeText.rectTransform);

        var titleText = CreateText("Ticket Title", ticket.transform, title, 28, new Color(0.12f, 0.12f, 0.18f, 1f), FontStyle.Bold, TextAnchor.UpperLeft);
        SetAnchor(titleText.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(260f, 32f), new Vector2(24f, -64f));

        var subtitleText = CreateText("Ticket Subtitle", ticket.transform, subtitle, 18, new Color(0.24f, 0.26f, 0.32f, 1f), FontStyle.Normal, TextAnchor.UpperLeft);
        SetAnchor(subtitleText.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(250f, 52f), new Vector2(24f, -100f));

        var codeLabel = CreateImage("Code Chip", ticket.transform, pillSprite, new Color(1f, 1f, 1f, 0.40f));
        ConfigureSlicedImage(codeLabel);
        SetAnchor(codeLabel.rectTransform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(204f, 34f), new Vector2(24f, 20f));

        var codeText = CreateText("Code Text", codeLabel.transform, code, 16, new Color(0.18f, 0.20f, 0.26f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(codeText.rectTransform);

        var revealChip = CreateImage("Reveal Chip", ticket.transform, pillSprite, new Color(0.14f, 0.56f, 0.96f, 0.96f));
        ConfigureSlicedImage(revealChip);
        SetAnchor(revealChip.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(110f, 34f), new Vector2(-24f, 20f));
        revealChip.gameObject.SetActive(false);

        var revealText = CreateText("Reveal Text", revealChip.transform, "REVEALED", 16, Color.white, FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(revealText.rectTransform);

        var scratchArea = CreateRect("Scratch Area", ticket.transform);
        SetAnchor(scratchArea, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(180f, 136f), new Vector2(-24f, 0f));

        var scratchFrame = CreateImage("Scratch Frame", scratchArea, roundedSprite, new Color(1f, 1f, 1f, 0.28f));
        ConfigureSlicedImage(scratchFrame);
        Stretch(scratchFrame.rectTransform);

        var scratchUnderlay = CreateImage("Scratch Underlay", scratchArea, roundedSprite, new Color(1f, 1f, 1f, 0.92f));
        scratchUnderlay.sprite = CreateRoundedGradientSprite(new Color(1f, 0.98f, 0.90f), new Color(1f, 0.92f, 0.78f), 128, 128, 22);
        ConfigureSlicedImage(scratchUnderlay);
        Stretch(scratchUnderlay.rectTransform, 8f, 8f, 8f, 8f);

        var underlayTitle = CreateText("Underlay Title", scratchUnderlay.transform, "AMAZON CODE", 16, new Color(0.50f, 0.42f, 0.18f, 1f), FontStyle.Bold, TextAnchor.UpperCenter);
        SetAnchor(underlayTitle.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(150f, 22f), new Vector2(0f, -18f));

        var underlayCode = CreateText("Underlay Code", scratchUnderlay.transform, code, 18, new Color(0.18f, 0.20f, 0.26f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
        SetAnchor(underlayCode.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(150f, 28f), new Vector2(0f, 0f));

        var scratchPrompt = CreateText("Scratch Prompt", scratchUnderlay.transform, "Scratch here", 16, new Color(0.60f, 0.48f, 0.20f, 1f), FontStyle.Bold, TextAnchor.LowerCenter);
        SetAnchor(scratchPrompt.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(150f, 22f), new Vector2(0f, 14f));

        var scratchOverlay = new GameObject("Scratch Overlay", typeof(RectTransform), typeof(RawImage));
        scratchOverlay.transform.SetParent(scratchArea, false);
        var scratchOverlayRect = scratchOverlay.GetComponent<RectTransform>();
        Stretch(scratchOverlayRect, 8f, 8f, 8f, 8f);
        var rawImage = scratchOverlay.GetComponent<RawImage>();
        rawImage.raycastTarget = true;

        var scratchController = scratchOverlay.AddComponent<ScratchTicketController>();
        scratchController.Initialize(rawImage, revealChip, OnScratchTicketRevealed);

        return scratchController;
    }

    private void CreateFavoriteRow(Transform parent, int index, string title, string subtitle, Color color)
    {
        var row = CreateRect("Favorite Row " + title, parent);
        SetAnchor(row, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(452f, 56f), new Vector2(0f, -38f - (index * 62f)));

        if (index > 0)
        {
            var divider = CreateImage("Divider", row, pillSprite, new Color(0f, 0f, 0f, 0.06f));
            ConfigureSlicedImage(divider);
            SetAnchor(divider.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(440f, 2f), new Vector2(0f, 20f));
        }

        var icon = CreateImage("Icon", row, roundedSprite, color);
        ConfigureSlicedImage(icon);
        SetAnchor(icon.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(48f, 48f), new Vector2(0f, -8f));

        var letter = CreateText("Letter", icon.transform, title.Length > 1 ? title.Substring(0, 2).ToUpperInvariant() : title.ToUpperInvariant(), 16, Color.white, FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(letter.rectTransform);

        var titleText = CreateText("Title", row, title, 20, new Color(0.13f, 0.15f, 0.20f, 1f), FontStyle.Bold, TextAnchor.UpperLeft);
        SetAnchor(titleText.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(240f, 24f), new Vector2(66f, 4f));

        var subtitleText = CreateText("Subtitle", row, subtitle, 16, new Color(0.38f, 0.40f, 0.46f, 1f), FontStyle.Normal, TextAnchor.LowerLeft);
        SetAnchor(subtitleText.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(260f, 22f), new Vector2(66f, -18f));

        var pill = CreateImage("Pill", row, pillSprite, new Color(0.11f, 0.12f, 0.18f, 0.08f));
        ConfigureSlicedImage(pill);
        SetAnchor(pill.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(84f, 32f), new Vector2(0f, -6f));

        var pillText = CreateText("Pill Text", pill.transform, "VIEW", 16, new Color(0.18f, 0.20f, 0.26f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
        Stretch(pillText.rectTransform);
    }

    private void BuildAppGrid(RectTransform page, AppIconDefinition[] apps)
    {
        const int columns = 4;
        const float iconWidth = 104f;
        const float iconHeight = 126f;
        const float cellX = 126f;
        const float cellY = 138f;
        const float startX = 0f;
        const float startY = 8f;

        for (var index = 0; index < apps.Length; index++)
        {
            var column = index % columns;
            var row = index / columns;
            var iconRoot = CreateRect("App " + apps[index].Label, page);
            iconRoot.anchorMin = new Vector2(0f, 1f);
            iconRoot.anchorMax = new Vector2(0f, 1f);
            iconRoot.pivot = new Vector2(0f, 1f);
            iconRoot.sizeDelta = new Vector2(iconWidth, iconHeight);
            iconRoot.anchoredPosition = new Vector2(startX + (column * cellX), -startY - (row * cellY));
            BuildIconVisual(iconRoot, apps[index], true);
        }
    }

    private void BuildIconVisual(RectTransform iconRoot, AppIconDefinition definition, bool withLabel)
    {
        var icon = CreateImage("Icon", iconRoot, roundedSprite, definition.Primary);
        ConfigureSlicedImage(icon);
        SetAnchor(icon.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(92f, 92f), new Vector2(0f, 0f));
        AddShadow(icon, new Color(0f, 0f, 0f, 0.18f), new Vector2(0f, -6f));

        var shine = CreateImage("Shine", icon.transform, circleSprite, new Color(1f, 1f, 1f, 0.16f));
        SetAnchor(shine.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(48f, 48f), new Vector2(18f, -16f));

        CreateIconArt(icon.rectTransform, definition.Label, definition.Monogram, definition.Secondary);

        var button = icon.gameObject.AddComponent<Button>();
        button.transition = Selectable.Transition.ColorTint;
        var colors = button.colors;
        colors.normalColor = Color.white;
        colors.highlightedColor = new Color(1f, 1f, 1f, 0.96f);
        colors.pressedColor = new Color(0.92f, 0.92f, 0.92f, 1f);
        colors.selectedColor = Color.white;
        colors.fadeDuration = 0.08f;
        button.colors = colors;

        if (definition.OnPressed != null)
        {
            button.onClick.AddListener(() => definition.OnPressed());
        }

        if (!withLabel)
        {
            return;
        }

        var label = CreateText("Label", iconRoot, definition.Label, 16, Color.white, FontStyle.Bold, TextAnchor.MiddleCenter);
        SetAnchor(label.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(108f, 24f), new Vector2(0f, 8f));
        AddShadow(label, new Color(0f, 0f, 0f, 0.28f), new Vector2(0f, -2f));
    }

    private void CreateIconArt(RectTransform parent, string label, string monogram, Color accent)
    {
        switch (label)
        {
            case "Messages":
            {
                var bubble = CreateImage("Bubble", parent, roundedSprite, Color.white);
                ConfigureSlicedImage(bubble);
                SetAnchor(bubble.rectTransform, new Vector2(0.5f, 0.55f), new Vector2(0.5f, 0.55f), new Vector2(54f, 42f), new Vector2(0f, 0f));
                var tail = CreateImage("Tail", parent, roundedSprite, Color.white);
                ConfigureSlicedImage(tail);
                SetAnchor(tail.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(16f, 16f), new Vector2(-10f, -18f));
                tail.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 45f);
                break;
            }
            case "Calendar":
            {
                var card = CreateImage("Card", parent, roundedSprite, Color.white);
                ConfigureSlicedImage(card);
                SetAnchor(card.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(58f, 58f), new Vector2(0f, 0f));
                var top = CreateImage("Top", card.transform, roundedSprite, new Color(0.97f, 0.22f, 0.26f, 1f));
                ConfigureSlicedImage(top);
                SetAnchor(top.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(58f, 18f), new Vector2(0f, 0f));
                var day = CreateText("Day", card.transform, "7", 28, new Color(0.12f, 0.14f, 0.18f, 1f), FontStyle.Bold, TextAnchor.MiddleCenter);
                SetAnchor(day.rectTransform, new Vector2(0.5f, 0.45f), new Vector2(0.5f, 0.45f), new Vector2(36f, 28f), Vector2.zero);
                break;
            }
            case "Photos":
            {
                for (var petal = 0; petal < 6; petal++)
                {
                    var angle = petal * 60f;
                    var color = Color.HSVToRGB(petal / 6f, 0.75f, 1f);
                    var piece = CreateImage("Petal " + petal, parent, circleSprite, color);
                    SetAnchor(piece.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(18f, 18f), new Vector2(Mathf.Cos(angle * Mathf.Deg2Rad) * 15f, Mathf.Sin(angle * Mathf.Deg2Rad) * 15f));
                }
                var center = CreateImage("Center", parent, circleSprite, Color.white);
                SetAnchor(center.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(16f, 16f), Vector2.zero);
                break;
            }
            case "Camera":
            {
                var body = CreateImage("Body", parent, roundedSprite, new Color(0.82f, 0.84f, 0.88f, 1f));
                ConfigureSlicedImage(body);
                SetAnchor(body.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(58f, 44f), new Vector2(0f, 0f));
                var lensOuter = CreateImage("LensOuter", body.transform, circleSprite, new Color(0.12f, 0.12f, 0.16f, 1f));
                SetAnchor(lensOuter.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(28f, 28f), Vector2.zero);
                var lensInner = CreateImage("LensInner", body.transform, circleSprite, new Color(0.36f, 0.44f, 0.50f, 1f));
                SetAnchor(lensInner.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(14f, 14f), Vector2.zero);
                break;
            }
            case "Maps":
            {
                var sheet = CreateImage("Sheet", parent, roundedSprite, Color.white);
                ConfigureSlicedImage(sheet);
                SetAnchor(sheet.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(58f, 58f), Vector2.zero);
                var green = CreateImage("Green Road", sheet.transform, pillSprite, new Color(0.24f, 0.76f, 0.34f, 1f));
                ConfigureSlicedImage(green);
                SetAnchor(green.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(44f, 10f), new Vector2(0f, -6f));
                green.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 32f);
                var blue = CreateImage("Blue Road", sheet.transform, pillSprite, new Color(0.18f, 0.56f, 1f, 1f));
                ConfigureSlicedImage(blue);
                SetAnchor(blue.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(44f, 10f), new Vector2(0f, 6f));
                blue.rectTransform.localRotation = Quaternion.Euler(0f, 0f, -28f);
                break;
            }
            case "Clock":
            {
                var face = CreateImage("Face", parent, circleSprite, Color.white);
                SetAnchor(face.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(54f, 54f), Vector2.zero);
                var handShort = CreateImage("Hand Short", face.transform, pillSprite, new Color(0.12f, 0.12f, 0.16f, 1f));
                ConfigureSlicedImage(handShort);
                SetAnchor(handShort.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(4f, 18f), new Vector2(0f, 4f));
                handShort.rectTransform.localRotation = Quaternion.Euler(0f, 0f, -12f);
                var handLong = CreateImage("Hand Long", face.transform, pillSprite, new Color(0.12f, 0.12f, 0.16f, 1f));
                ConfigureSlicedImage(handLong);
                SetAnchor(handLong.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(4f, 22f), new Vector2(0f, 8f));
                handLong.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 68f);
                break;
            }
            case "Weather":
            {
                var sun = CreateImage("Sun", parent, circleSprite, new Color(1f, 0.86f, 0.24f, 1f));
                SetAnchor(sun.rectTransform, new Vector2(0.44f, 0.58f), new Vector2(0.44f, 0.58f), new Vector2(28f, 28f), Vector2.zero);
                var cloudA = CreateImage("CloudA", parent, circleSprite, Color.white);
                SetAnchor(cloudA.rectTransform, new Vector2(0.58f, 0.48f), new Vector2(0.58f, 0.48f), new Vector2(24f, 24f), Vector2.zero);
                var cloudB = CreateImage("CloudB", parent, circleSprite, Color.white);
                SetAnchor(cloudB.rectTransform, new Vector2(0.46f, 0.46f), new Vector2(0.46f, 0.46f), new Vector2(30f, 30f), Vector2.zero);
                var cloudBase = CreateImage("CloudBase", parent, pillSprite, Color.white);
                ConfigureSlicedImage(cloudBase);
                SetAnchor(cloudBase.rectTransform, new Vector2(0.5f, 0.38f), new Vector2(0.5f, 0.38f), new Vector2(44f, 18f), Vector2.zero);
                break;
            }
            case "App Store":
            {
                CreateStoreStick(parent, new Vector2(-12f, -2f), 28f, 6f, 58f);
                CreateStoreStick(parent, new Vector2(0f, 10f), 28f, 6f, -58f);
                CreateStoreStick(parent, new Vector2(12f, -2f), 28f, 6f, 0f);
                break;
            }
            default:
            {
                var symbol = CreateText("Monogram", parent, monogram, 24, label == "TikTok" ? accent : Color.white, FontStyle.Bold, TextAnchor.MiddleCenter);
                Stretch(symbol.rectTransform);
                break;
            }
        }
    }

    private void CreateStoreStick(RectTransform parent, Vector2 position, float width, float height, float rotation)
    {
        var stick = CreateImage("Stick", parent, pillSprite, Color.white);
        ConfigureSlicedImage(stick);
        SetAnchor(stick.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(width, height), position);
        stick.rectTransform.localRotation = Quaternion.Euler(0f, 0f, rotation);
    }

    private void BuildPhoneWallpaper(Transform parent, float darkOverlayAlpha)
    {
        var wallpaper = CreateImage("Wallpaper", parent, wallpaperSprite, Color.white);
        Stretch(wallpaper.rectTransform);

        CreateAmbientGlow(parent, new Vector2(-130f, 260f), new Vector2(280f, 280f), new Color(1f, 1f, 1f, 0.09f));
        CreateAmbientGlow(parent, new Vector2(170f, -120f), new Vector2(320f, 320f), new Color(1f, 0.86f, 0.94f, 0.10f));

        var overlay = CreateImage("Overlay", parent, roundedSprite, new Color(0f, 0f, 0f, darkOverlayAlpha));
        Stretch(overlay.rectTransform);
    }

    private void BuildSoftBackground(Transform parent, Sprite backdrop, Color overlayColor)
    {
        var background = CreateImage("Background", parent, backdrop, Color.white);
        Stretch(background.rectTransform);

        CreateAmbientGlow(parent, new Vector2(-160f, 260f), new Vector2(320f, 320f), new Color(1f, 0.76f, 0.84f, 0.14f));
        CreateAmbientGlow(parent, new Vector2(180f, -160f), new Vector2(360f, 360f), new Color(0.72f, 0.78f, 1f, 0.14f));

        var overlay = CreateImage("Overlay", parent, roundedSprite, overlayColor);
        Stretch(overlay.rectTransform);
    }

    private void BuildStatusBar(Transform parent, Color contentColor)
    {
        var root = CreateRect("Status Bar", parent);
        SetAnchor(root, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(514f, 28f), new Vector2(0f, -30f));

        var time = CreateText("Status Time", root, "9:41", 18, contentColor, FontStyle.Bold, TextAnchor.MiddleLeft);
        SetAnchor(time.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(80f, 24f), new Vector2(4f, 0f));
        statusTimeTexts.Add(time);

        var network = CreateText("Status Network", root, "5G", 16, contentColor, FontStyle.Bold, TextAnchor.MiddleCenter);
        SetAnchor(network.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(34f, 22f), new Vector2(-96f, 0f));

        var battery = CreateRect("Battery", root);
        SetAnchor(battery, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(42f, 18f), new Vector2(-34f, 0f));

        var batteryBody = CreateImage("Battery Body", battery, roundedSprite, new Color(contentColor.r, contentColor.g, contentColor.b, 0.85f));
        ConfigureSlicedImage(batteryBody);
        Stretch(batteryBody.rectTransform, 0f, 4f, 0f, 0f);

        var batteryCap = CreateImage("Battery Cap", battery, pillSprite, new Color(contentColor.r, contentColor.g, contentColor.b, 0.85f));
        ConfigureSlicedImage(batteryCap);
        SetAnchor(batteryCap.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(4f, 8f), new Vector2(0f, 0f));

        var batteryLevel = CreateImage("Battery Level", batteryBody.transform, roundedSprite, contentColor);
        ConfigureSlicedImage(batteryLevel);
        Stretch(batteryLevel.rectTransform, 2f, 8f, 2f, 2f);

        for (var barIndex = 0; barIndex < 3; barIndex++)
        {
            var signalBar = CreateImage("Signal " + barIndex, root, pillSprite, contentColor);
            ConfigureSlicedImage(signalBar);
            SetAnchor(signalBar.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(4f, 8f + (barIndex * 4f)), new Vector2(-132f + (barIndex * 8f), 4f));
        }
    }

    private GameObject CreateScreenLayer(string name, Transform parent)
    {
        var layer = CreateRect(name, parent);
        Stretch(layer);
        var canvasGroup = layer.gameObject.AddComponent<CanvasGroup>();
        canvasGroup.alpha = 0f;
        canvasGroup.interactable = false;
        canvasGroup.blocksRaycasts = false;
        return layer.gameObject;
    }

    private void ShowScreen(ExperienceScreen target, bool immediate = false)
    {
        currentScreen = target;
        homeIndicator.SetActive(target != ExperienceScreen.Lock);

        var targetScreen = GetScreenObject(target);
        if (target == ExperienceScreen.Home && homePager != null)
        {
            homePager.RefreshPosition();
        }

        if (screenTransition != null)
        {
            StopCoroutine(screenTransition);
            screenTransition = null;
        }

        if (immediate)
        {
            ApplyScreenVisibility(targetScreen, 1f);
            return;
        }

        screenTransition = StartCoroutine(FadeToScreen(targetScreen));
    }

    private IEnumerator FadeToScreen(GameObject target)
    {
        var screens = GetAllScreens();
        var groups = new CanvasGroup[screens.Length];
        var startAlpha = new float[screens.Length];

        for (var index = 0; index < screens.Length; index++)
        {
            groups[index] = screens[index].GetComponent<CanvasGroup>();
            startAlpha[index] = groups[index].alpha;
            if (screens[index] == target)
            {
                screens[index].SetActive(true);
            }

            groups[index].blocksRaycasts = false;
            groups[index].interactable = false;
        }

        const float duration = 0.22f;
        var elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.unscaledDeltaTime;
            var t = Mathf.Clamp01(elapsed / duration);

            for (var index = 0; index < screens.Length; index++)
            {
                var desired = screens[index] == target ? 1f : 0f;
                groups[index].alpha = Mathf.Lerp(startAlpha[index], desired, t);
            }

            yield return null;
        }

        ApplyScreenVisibility(target, 1f);
        screenTransition = null;
    }

    private void ApplyScreenVisibility(GameObject target, float targetAlpha)
    {
        var screens = GetAllScreens();
        for (var index = 0; index < screens.Length; index++)
        {
            var isTarget = screens[index] == target;
            screens[index].SetActive(isTarget);
            var group = screens[index].GetComponent<CanvasGroup>();
            group.alpha = isTarget ? targetAlpha : 0f;
            group.blocksRaycasts = isTarget;
            group.interactable = isTarget;
        }
    }

    private GameObject GetScreenObject(ExperienceScreen screen)
    {
        switch (screen)
        {
            case ExperienceScreen.Lock:
                return lockScreen;
            case ExperienceScreen.Home:
                return homeScreen;
            case ExperienceScreen.Store:
                return appStoreScreen;
            default:
                return gameScreen;
        }
    }

    private GameObject[] GetAllScreens()
    {
        return new[] { lockScreen, homeScreen, appStoreScreen, gameScreen };
    }

    private void UpdatePageDots(int pageIndex)
    {
        for (var index = 0; index < pageDots.Count; index++)
        {
            pageDots[index].color = index == pageIndex ? Color.white : new Color(1f, 1f, 1f, 0.35f);
        }
    }

    private void OnEvaDownloadPressed()
    {
        if (evaGameDownloading)
        {
            return;
        }

        if (evaGameDownloaded)
        {
            ShowScreen(ExperienceScreen.Game);
            return;
        }

        StartCoroutine(DownloadEvaGameRoutine());
    }

    private IEnumerator DownloadEvaGameRoutine()
    {
        evaGameDownloading = true;
        UpdateDownloadButtonVisuals();

        const float duration = 2.4f;
        var elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.unscaledDeltaTime;
            var progress = Mathf.Clamp01(elapsed / duration);
            evaDownloadProgressFill.rectTransform.sizeDelta = new Vector2(98f * progress, 0f);
            yield return null;
        }

        evaGameDownloading = false;
        evaGameDownloaded = true;
        UpdateDownloadButtonVisuals();

        yield return new WaitForSecondsRealtime(0.45f);
        ShowScreen(ExperienceScreen.Game);
    }

    private void UpdateDownloadButtonVisuals()
    {
        if (evaDownloadButton == null)
        {
            return;
        }

        var image = evaDownloadButton.GetComponent<Image>();
        var progressTrack = evaDownloadProgressFill.transform.parent.gameObject;

        if (evaGameDownloading)
        {
            image.color = new Color(0.11f, 0.44f, 0.92f, 1f);
            evaDownloadButtonText.text = "Downloading";
            evaDownloadButtonText.alignment = TextAnchor.MiddleCenter;
            evaDownloadButtonGlyph.gameObject.SetActive(true);
            progressTrack.SetActive(true);
            evaDownloadProgressFill.rectTransform.sizeDelta = new Vector2(0f, 0f);
            return;
        }

        progressTrack.SetActive(false);
        evaDownloadButtonGlyph.gameObject.SetActive(false);

        if (evaGameDownloaded)
        {
            image.color = new Color(0.10f, 0.62f, 0.44f, 1f);
            evaDownloadButtonText.text = "OPEN";
            return;
        }

        image.color = new Color(0.12f, 0.48f, 1f, 1f);
        evaDownloadButtonText.text = "GET";
    }

    private void OnScratchTicketRevealed(ScratchTicketController _)
    {
        var revealedCount = 0;
        for (var index = 0; index < scratchTickets.Count; index++)
        {
            if (scratchTickets[index].IsRevealed)
            {
                revealedCount++;
            }
        }
    }

    private IEnumerator ClockRoutine()
    {
        while (true)
        {
            RefreshClock();
            yield return new WaitForSecondsRealtime(1f);
        }
    }

    private void RefreshClock()
    {
        var now = DateTime.Now;
        var shortTime = now.ToString("h:mm");

        for (var index = 0; index < statusTimeTexts.Count; index++)
        {
            statusTimeTexts[index].text = shortTime;
        }

        if (lockClockText != null)
        {
            lockClockText.text = shortTime;
        }

        if (lockDateText != null)
        {
            lockDateText.text = now.ToString("dddd, MMMM d");
        }
    }

    private static Font LoadBuiltinFont()
    {
        try
        {
            var legacyFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (legacyFont != null)
            {
                return legacyFont;
            }
        }
        catch
        {
        }

        return Resources.GetBuiltinResource<Font>("Arial.ttf");
    }

    private static void ConfigureSlicedImage(Image image)
    {
        image.type = Image.Type.Sliced;
    }

    private static void AddShadow(Graphic graphic, Color color, Vector2 offset)
    {
        var shadow = graphic.gameObject.AddComponent<Shadow>();
        shadow.effectColor = color;
        shadow.effectDistance = offset;
        shadow.useGraphicAlpha = true;
    }

    private static RectTransform CreateRect(string name, Transform parent)
    {
        var gameObject = new GameObject(name, typeof(RectTransform));
        gameObject.transform.SetParent(parent, false);
        return gameObject.GetComponent<RectTransform>();
    }

    private static void Stretch(RectTransform rectTransform, float left = 0f, float right = 0f, float top = 0f, float bottom = 0f)
    {
        rectTransform.anchorMin = Vector2.zero;
        rectTransform.anchorMax = Vector2.one;
        rectTransform.offsetMin = new Vector2(left, bottom);
        rectTransform.offsetMax = new Vector2(-right, -top);
    }

    private static void SetCentered(RectTransform rectTransform, float width, float height, float x, float y)
    {
        rectTransform.anchorMin = new Vector2(0.5f, 0.5f);
        rectTransform.anchorMax = new Vector2(0.5f, 0.5f);
        rectTransform.pivot = new Vector2(0.5f, 0.5f);
        rectTransform.sizeDelta = new Vector2(width, height);
        rectTransform.anchoredPosition = new Vector2(x, y);
    }

    private static void SetAnchor(RectTransform rectTransform, Vector2 anchorMin, Vector2 anchorMax, Vector2 size, Vector2 position)
    {
        rectTransform.anchorMin = anchorMin;
        rectTransform.anchorMax = anchorMax;
        rectTransform.pivot = new Vector2(
            Mathf.Lerp(anchorMin.x, anchorMax.x, 0.5f),
            Mathf.Lerp(anchorMin.y, anchorMax.y, 0.5f));
        rectTransform.sizeDelta = size;
        rectTransform.anchoredPosition = position;
    }

    private Image CreateImage(string name, Transform parent, Sprite sprite, Color color)
    {
        var gameObject = new GameObject(name, typeof(RectTransform), typeof(Image));
        gameObject.transform.SetParent(parent, false);
        var image = gameObject.GetComponent<Image>();
        image.sprite = sprite;
        image.color = color;
        image.raycastTarget = false;
        return image;
    }

    private Text CreateText(string name, Transform parent, string content, int fontSize, Color color, FontStyle style, TextAnchor anchor)
    {
        var gameObject = new GameObject(name, typeof(RectTransform), typeof(Text));
        gameObject.transform.SetParent(parent, false);
        var text = gameObject.GetComponent<Text>();
        text.font = uiFont;
        text.text = content;
        text.fontSize = fontSize;
        text.color = color;
        text.alignment = anchor;
        text.fontStyle = style;
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Overflow;
        text.raycastTarget = false;
        return text;
    }

    private Button CreatePillButton(Transform parent, string label, float width, float height, Vector2 anchoredPosition, Color background, Color foreground, FontStyle style)
    {
        var image = CreateImage("Pill Button", parent, pillSprite, background);
        ConfigureSlicedImage(image);
        SetAnchor(image.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(width, height), anchoredPosition);
        image.raycastTarget = true;
        var button = image.gameObject.AddComponent<Button>();
        button.transition = Selectable.Transition.None;

        var text = CreateText("Button Label", image.transform, label, 18, foreground, style, TextAnchor.MiddleCenter);
        Stretch(text.rectTransform, 14f, 14f, 0f, 0f);
        return button;
    }

    private Text FindTextChild(Transform parent, string childName)
    {
        var child = parent.Find(childName);
        return child != null ? child.GetComponent<Text>() : null;
    }

    private void CreateAmbientGlow(Transform parent, Vector2 position, Vector2 size, Color color)
    {
        var glow = CreateImage("Glow", parent, circleSprite, color);
        SetCentered(glow.rectTransform, size.x, size.y, position.x, position.y);
    }

    private static Sprite CreateRoundedSprite(int width, int height, int radius)
    {
        var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
        var pixels = new Color32[width * height];
        var centerX = (width - 1) * 0.5f;
        var centerY = (height - 1) * 0.5f;
        var innerWidth = centerX - radius;
        var innerHeight = centerY - radius;

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var dx = Mathf.Max(Mathf.Abs(x - centerX) - innerWidth, 0f);
                var dy = Mathf.Max(Mathf.Abs(y - centerY) - innerHeight, 0f);
                var distance = Mathf.Sqrt((dx * dx) + (dy * dy));
                var alpha = distance <= radius ? 1f : 0f;
                pixels[(y * width) + x] = new Color(1f, 1f, 1f, alpha);
            }
        }

        texture.SetPixels32(pixels);
        texture.filterMode = FilterMode.Bilinear;
        texture.wrapMode = TextureWrapMode.Clamp;
        texture.Apply();
        return Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(radius, radius, radius, radius));
    }

    private static Sprite CreateGradientSprite(Color top, Color bottom)
    {
        const int width = 16;
        const int height = 256;
        var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
        var pixels = new Color[width * height];

        for (var y = 0; y < height; y++)
        {
            var t = y / (height - 1f);
            var color = Color.Lerp(bottom, top, t);
            for (var x = 0; x < width; x++)
            {
                pixels[(y * width) + x] = color;
            }
        }

        texture.SetPixels(pixels);
        texture.filterMode = FilterMode.Bilinear;
        texture.wrapMode = TextureWrapMode.Clamp;
        texture.Apply();
        return Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f);
    }

    private static Sprite CreateRoundedGradientSprite(Color top, Color bottom, int width, int height, int radius)
    {
        var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
        var pixels = new Color32[width * height];
        var centerX = (width - 1) * 0.5f;
        var centerY = (height - 1) * 0.5f;
        var innerWidth = centerX - radius;
        var innerHeight = centerY - radius;

        for (var y = 0; y < height; y++)
        {
            var t = y / (height - 1f);
            var color = Color.Lerp(bottom, top, t);
            for (var x = 0; x < width; x++)
            {
                var dx = Mathf.Max(Mathf.Abs(x - centerX) - innerWidth, 0f);
                var dy = Mathf.Max(Mathf.Abs(y - centerY) - innerHeight, 0f);
                var distance = Mathf.Sqrt((dx * dx) + (dy * dy));
                var alpha = distance <= radius ? 1f : 0f;
                pixels[(y * width) + x] = new Color(color.r, color.g, color.b, alpha);
            }
        }

        texture.SetPixels32(pixels);
        texture.filterMode = FilterMode.Bilinear;
        texture.wrapMode = TextureWrapMode.Clamp;
        texture.Apply();
        return Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(radius, radius, radius, radius));
    }

    private static Sprite CreateBackdropSprite(int width, int height)
    {
        var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
        var pixels = new Color[width * height];
        var top = new Color(0.06f, 0.05f, 0.11f, 1f);
        var bottom = new Color(0.18f, 0.10f, 0.20f, 1f);

        for (var y = 0; y < height; y++)
        {
            var v = y / (height - 1f);
            for (var x = 0; x < width; x++)
            {
                var u = x / (width - 1f);
                var color = Color.Lerp(bottom, top, Mathf.Pow(v, 0.72f));
                color = Color.Lerp(color, new Color(0.95f, 0.28f, 0.56f, 1f), Radial(u, v, 0.28f, 0.78f, 0.28f) * 0.32f);
                color = Color.Lerp(color, new Color(0.28f, 0.56f, 1f, 1f), Radial(u, v, 0.72f, 0.22f, 0.30f) * 0.28f);
                color = Color.Lerp(color, new Color(1f, 1f, 1f, 1f), Radial(u, v, 0.50f, 0.52f, 0.42f) * 0.05f);
                pixels[(y * width) + x] = color;
            }
        }

        texture.SetPixels(pixels);
        texture.filterMode = FilterMode.Bilinear;
        texture.wrapMode = TextureWrapMode.Clamp;
        texture.Apply();
        return Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f);
    }

    private static Sprite CreateWallpaperSprite(int width, int height)
    {
        var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
        var pixels = new Color[width * height];
        var top = new Color(0.12f, 0.07f, 0.26f, 1f);
        var bottom = new Color(0.98f, 0.48f, 0.68f, 1f);

        for (var y = 0; y < height; y++)
        {
            var v = y / (height - 1f);
            for (var x = 0; x < width; x++)
            {
                var u = x / (width - 1f);
                var color = Color.Lerp(bottom, top, Mathf.Pow(v, 0.74f));
                color = Color.Lerp(color, new Color(1f, 0.82f, 0.90f, 1f), Radial(u, v, 0.20f, 0.82f, 0.26f) * 0.36f);
                color = Color.Lerp(color, new Color(0.52f, 0.54f, 1f, 1f), Radial(u, v, 0.78f, 0.54f, 0.32f) * 0.42f);
                color = Color.Lerp(color, new Color(1f, 1f, 1f, 1f), Radial(u, v, 0.40f, 0.18f, 0.24f) * 0.10f);
                pixels[(y * width) + x] = color;
            }
        }

        texture.SetPixels(pixels);
        texture.filterMode = FilterMode.Bilinear;
        texture.wrapMode = TextureWrapMode.Clamp;
        texture.Apply();
        return Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f);
    }

    private static float Radial(float u, float v, float centerX, float centerY, float radius)
    {
        var dx = u - centerX;
        var dy = v - centerY;
        var distance = Mathf.Sqrt((dx * dx) + (dy * dy));
        return Mathf.Clamp01(1f - (distance / radius));
    }

    private class SlideUnlockControl : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        private RectTransform trackRect;
        private RectTransform knobRect;
        private RectTransform fillRect;
        private Text label;
        private Action onUnlocked;
        private float maxTravel;
        private bool unlocked;

        public void Initialize(RectTransform track, RectTransform knob, RectTransform fill, Text labelText, Action onComplete)
        {
            trackRect = track;
            knobRect = knob;
            fillRect = fill;
            label = labelText;
            onUnlocked = onComplete;
            maxTravel = track.rect.width - knob.rect.width - 16f;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            UpdateFromPointer(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            UpdateFromPointer(eventData);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (!unlocked)
            {
                StartCoroutine(ReturnKnobRoutine());
            }
        }

        private void UpdateFromPointer(PointerEventData eventData)
        {
            if (unlocked)
            {
                return;
            }

            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(trackRect, eventData.position, eventData.pressEventCamera, out var local))
            {
                return;
            }

            var clamped = Mathf.Clamp(local.x + (trackRect.rect.width * 0.5f) - (knobRect.rect.width * 0.5f) - 8f, 0f, maxTravel);
            knobRect.anchoredPosition = new Vector2(8f + clamped, 0f);
            fillRect.sizeDelta = new Vector2(knobRect.rect.width + clamped, 0f);

            var progress = maxTravel <= 0f ? 0f : clamped / maxTravel;
            label.color = new Color(1f, 1f, 1f, Mathf.Lerp(0.95f, 0.25f, progress));

            if (progress >= 0.92f)
            {
                unlocked = true;
                knobRect.anchoredPosition = new Vector2(8f + maxTravel, 0f);
                fillRect.sizeDelta = new Vector2(knobRect.rect.width + maxTravel, 0f);
                onUnlocked?.Invoke();
            }
        }

        private IEnumerator ReturnKnobRoutine()
        {
            var startX = knobRect.anchoredPosition.x;
            var startFill = fillRect.sizeDelta.x;
            const float duration = 0.18f;
            var elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                var t = elapsed / duration;
                var eased = 1f - Mathf.Pow(1f - t, 3f);
                knobRect.anchoredPosition = new Vector2(Mathf.Lerp(startX, 8f, eased), 0f);
                fillRect.sizeDelta = new Vector2(Mathf.Lerp(startFill, knobRect.rect.width, eased), 0f);
                yield return null;
            }

            knobRect.anchoredPosition = new Vector2(8f, 0f);
            fillRect.sizeDelta = new Vector2(knobRect.rect.width, 0f);
            label.color = new Color(1f, 1f, 1f, 0.92f);
        }
    }

    private class HomePagerController : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        private RectTransform viewportRect;
        private RectTransform pagesRect;
        private int pageCount;
        private float pageWidth;
        private int currentPage;
        private float dragStartX;
        private float pageStartX;
        private Action<int> onPageChanged;
        private Coroutine snapRoutine;

        public void Initialize(RectTransform viewport, RectTransform pages, int count, Action<int> changedCallback)
        {
            viewportRect = viewport;
            pagesRect = pages;
            pageCount = count;
            pageWidth = viewport.rect.width;
            onPageChanged = changedCallback;
            JumpToPage(0);
        }

        public void RefreshPosition()
        {
            pagesRect.anchoredPosition = new Vector2(-(currentPage * pageWidth), 0f);
        }

        public void OnBeginDrag(PointerEventData eventData)
        {
            if (snapRoutine != null)
            {
                StopCoroutine(snapRoutine);
                snapRoutine = null;
            }

            dragStartX = eventData.position.x;
            pageStartX = pagesRect.anchoredPosition.x;
        }

        public void OnDrag(PointerEventData eventData)
        {
            var delta = eventData.position.x - dragStartX;
            var minX = -((pageCount - 1) * pageWidth);
            var desired = Mathf.Clamp(pageStartX + delta, minX - 36f, 36f);
            pagesRect.anchoredPosition = new Vector2(desired, 0f);
        }

        public void OnEndDrag(PointerEventData eventData)
        {
            var rawPage = -pagesRect.anchoredPosition.x / pageWidth;
            var targetPage = Mathf.Clamp(Mathf.RoundToInt(rawPage), 0, pageCount - 1);
            JumpToPage(targetPage, true);
        }

        private void JumpToPage(int page, bool animated = false)
        {
            currentPage = page;
            onPageChanged?.Invoke(page);

            if (!animated)
            {
                pagesRect.anchoredPosition = new Vector2(-(page * pageWidth), 0f);
                return;
            }

            snapRoutine = StartCoroutine(SnapRoutine(-(page * pageWidth)));
        }

        private IEnumerator SnapRoutine(float targetX)
        {
            var startX = pagesRect.anchoredPosition.x;
            const float duration = 0.18f;
            var elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                var t = elapsed / duration;
                var eased = 1f - Mathf.Pow(1f - t, 3f);
                pagesRect.anchoredPosition = new Vector2(Mathf.Lerp(startX, targetX, eased), 0f);
                yield return null;
            }

            pagesRect.anchoredPosition = new Vector2(targetX, 0f);
            snapRoutine = null;
        }
    }

    private class ScratchTicketController : MonoBehaviour, IPointerDownHandler, IDragHandler
    {
        private const int TextureWidth = 192;
        private const int TextureHeight = 136;
        private const int BrushRadius = 13;

        private RawImage rawImage;
        private Image revealChip;
        private Action<ScratchTicketController> onReveal;
        private Texture2D scratchTexture;
        private Color32[] pixels;
        private bool revealed;
        private int clearedPixels;
        private Vector2Int previousPixel = new Vector2Int(-1, -1);

        public bool IsRevealed => revealed;

        public void Initialize(RawImage targetImage, Image revealImage, Action<ScratchTicketController> revealCallback)
        {
            rawImage = targetImage;
            revealChip = revealImage;
            onReveal = revealCallback;

            scratchTexture = new Texture2D(TextureWidth, TextureHeight, TextureFormat.RGBA32, false);
            pixels = new Color32[TextureWidth * TextureHeight];

            for (var y = 0; y < TextureHeight; y++)
            {
                for (var x = 0; x < TextureWidth; x++)
                {
                    var noise = Mathf.PerlinNoise(x * 0.08f, y * 0.08f);
                    var shade = (byte)Mathf.Lerp(160f, 228f, noise);
                    pixels[(y * TextureWidth) + x] = new Color32(shade, shade, shade, 255);
                }
            }

            scratchTexture.SetPixels32(pixels);
            scratchTexture.filterMode = FilterMode.Bilinear;
            scratchTexture.wrapMode = TextureWrapMode.Clamp;
            scratchTexture.Apply();
            rawImage.texture = scratchTexture;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            previousPixel = new Vector2Int(-1, -1);
            Scratch(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            Scratch(eventData);
        }

        private void Scratch(PointerEventData eventData)
        {
            if (revealed)
            {
                return;
            }

            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(rawImage.rectTransform, eventData.position, eventData.pressEventCamera, out var localPoint))
            {
                return;
            }

            var rect = rawImage.rectTransform.rect;
            var normalizedX = Mathf.InverseLerp(rect.xMin, rect.xMax, localPoint.x);
            var normalizedY = Mathf.InverseLerp(rect.yMin, rect.yMax, localPoint.y);

            var pixelX = Mathf.RoundToInt(normalizedX * (TextureWidth - 1));
            var pixelY = Mathf.RoundToInt(normalizedY * (TextureHeight - 1));
            var current = new Vector2Int(pixelX, pixelY);

            if (previousPixel.x >= 0)
            {
                ScratchLine(previousPixel, current);
            }
            else
            {
                EraseCircle(current.x, current.y);
            }

            previousPixel = current;
            scratchTexture.SetPixels32(pixels);
            scratchTexture.Apply();

            var clearRatio = clearedPixels / (float)(TextureWidth * TextureHeight);
            if (clearRatio >= 0.38f)
            {
                Reveal();
            }
        }

        private void ScratchLine(Vector2Int from, Vector2Int to)
        {
            var steps = Mathf.CeilToInt(Vector2Int.Distance(from, to));
            steps = Mathf.Max(steps, 1);
            for (var step = 0; step <= steps; step++)
            {
                var t = step / (float)steps;
                var x = Mathf.RoundToInt(Mathf.Lerp(from.x, to.x, t));
                var y = Mathf.RoundToInt(Mathf.Lerp(from.y, to.y, t));
                EraseCircle(x, y);
            }
        }

        private void EraseCircle(int centerX, int centerY)
        {
            var radiusSquared = BrushRadius * BrushRadius;
            for (var y = -BrushRadius; y <= BrushRadius; y++)
            {
                for (var x = -BrushRadius; x <= BrushRadius; x++)
                {
                    if ((x * x) + (y * y) > radiusSquared)
                    {
                        continue;
                    }

                    var px = centerX + x;
                    var py = centerY + y;
                    if (px < 0 || px >= TextureWidth || py < 0 || py >= TextureHeight)
                    {
                        continue;
                    }

                    var index = (py * TextureWidth) + px;
                    if (pixels[index].a == 0)
                    {
                        continue;
                    }

                    pixels[index].a = 0;
                    clearedPixels++;
                }
            }
        }

        private void Reveal()
        {
            if (revealed)
            {
                return;
            }

            revealed = true;
            revealChip.gameObject.SetActive(true);
            onReveal?.Invoke(this);
            StartCoroutine(FadeOutRoutine());
        }

        private IEnumerator FadeOutRoutine()
        {
            const float duration = 0.28f;
            var elapsed = 0f;
            var canvasGroup = rawImage.GetComponent<CanvasGroup>();
            if (canvasGroup == null)
            {
                canvasGroup = rawImage.gameObject.AddComponent<CanvasGroup>();
            }

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                var t = elapsed / duration;
                canvasGroup.alpha = 1f - t;
                yield return null;
            }

            canvasGroup.alpha = 0f;
            rawImage.raycastTarget = false;
        }
    }
}
