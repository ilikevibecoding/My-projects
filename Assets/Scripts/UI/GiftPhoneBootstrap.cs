using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SubnauticaClone.GiftPhone
{
    [DefaultExecutionOrder(-500)]
    public class GiftPhoneBootstrap : MonoBehaviour
    {
        private const float PhoneWidth = 636f;
        private const float PhoneHeight = 1320f;
        private const float ScreenWidth = 582f;
        private const float ScreenHeight = 1260f;
        private const float PageViewportHeight = 880f;

        private static bool hasBootstrapped;

        private readonly List<Image> pageDots = new List<Image>();
        private readonly List<ScratchTicketController> scratchTickets = new List<ScratchTicketController>();

        private Font font;
        private CanvasGroup activeScreen;
        private CanvasGroup lockScreen;
        private CanvasGroup homeScreen;
        private CanvasGroup appStoreScreen;
        private CanvasGroup scratcherScreen;
        private Text statusTimeText;
        private Text lockTimeText;
        private Text lockDateText;
        private Text unlockPromptText;
        private Text heroStatusText;
        private Text installLabelText;
        private Text finalRevealText;
        private Button installButton;
        private Image installButtonBackground;
        private RectTransform installArrowGroup;
        private CanvasGroup installRingGroup;
        private Image installRingFill;
        private Slider unlockSlider;
        private DateTime lastClockTime;
        private bool appInstalled;
        private bool downloadInProgress;
        private int revealedTicketCount;
        private Coroutine transitionRoutine;
        private Coroutine downloadRoutine;

        private static readonly AppIconDefinition[][] HomePages =
        {
            new[]
            {
                new AppIconDefinition("FaceTime", "FT", new Color(0.21f, 0.78f, 0.46f), IconStyle.Text),
                new AppIconDefinition("Calendar", "14", new Color(0.94f, 0.24f, 0.23f), IconStyle.Calendar),
                new AppIconDefinition("Photos", "PH", new Color(0.95f, 0.66f, 0.16f), IconStyle.Text),
                new AppIconDefinition("Camera", "CAM", new Color(0.20f, 0.20f, 0.24f), IconStyle.Camera),
                new AppIconDefinition("Mail", "M", new Color(0.14f, 0.58f, 0.98f), IconStyle.Text),
                new AppIconDefinition("Clock", "CLK", new Color(0.10f, 0.12f, 0.16f), IconStyle.Text),
                new AppIconDefinition("Maps", "MAP", new Color(0.26f, 0.80f, 0.51f), IconStyle.Text),
                new AppIconDefinition("Weather", "SUN", new Color(0.29f, 0.63f, 1.00f), IconStyle.Text),
                new AppIconDefinition("Notes", "N", new Color(0.96f, 0.84f, 0.24f), IconStyle.Notes),
                new AppIconDefinition("Reminders", "DO", new Color(0.98f, 0.98f, 0.98f), IconStyle.Text, new Color(0.17f, 0.20f, 0.27f)),
                new AppIconDefinition("App Store", "A", new Color(0.11f, 0.53f, 1.00f), IconStyle.AppStore, Color.white, true),
                new AppIconDefinition("Settings", "SET", new Color(0.54f, 0.58f, 0.65f), IconStyle.Text),
                new AppIconDefinition("TikTok", "TT", new Color(0.08f, 0.08f, 0.10f), IconStyle.TikTok),
                new AppIconDefinition("Music", "MUS", new Color(0.95f, 0.19f, 0.48f), IconStyle.Text),
                new AppIconDefinition("Messages", "MSG", new Color(0.19f, 0.79f, 0.36f), IconStyle.Messages),
                new AppIconDefinition("Safari", "SAF", new Color(0.25f, 0.72f, 1.00f), IconStyle.Text)
            },
            new[]
            {
                new AppIconDefinition("Health", "H", new Color(1.00f, 0.39f, 0.45f), IconStyle.Text),
                new AppIconDefinition("Wallet", "W", new Color(0.11f, 0.13f, 0.18f), IconStyle.Text),
                new AppIconDefinition("Books", "BK", new Color(0.97f, 0.54f, 0.26f), IconStyle.Text),
                new AppIconDefinition("Files", "FL", new Color(0.25f, 0.58f, 0.96f), IconStyle.Text),
                new AppIconDefinition("Fitness", "FIT", new Color(0.79f, 0.22f, 0.57f), IconStyle.Text),
                new AppIconDefinition("Clips", "CC", new Color(0.61f, 0.21f, 0.98f), IconStyle.Text),
                new AppIconDefinition("Calculator", "CAL", new Color(0.16f, 0.16f, 0.18f), IconStyle.Text),
                new AppIconDefinition("Translate", "TR", new Color(0.95f, 0.95f, 0.98f), IconStyle.Text, new Color(0.18f, 0.21f, 0.29f)),
                new AppIconDefinition("Podcasts", "PC", new Color(0.57f, 0.26f, 0.97f), IconStyle.Text),
                new AppIconDefinition("TV", "TV", new Color(0.12f, 0.12f, 0.14f), IconStyle.Text),
                new AppIconDefinition("Journal", "JR", new Color(0.28f, 0.52f, 0.95f), IconStyle.Text),
                new AppIconDefinition("Contacts", "CT", new Color(0.76f, 0.77f, 0.80f), IconStyle.Text),
                new AppIconDefinition("Shortcuts", "SC", new Color(0.92f, 0.42f, 0.18f), IconStyle.Text),
                new AppIconDefinition("Find My", "FM", new Color(0.11f, 0.76f, 0.54f), IconStyle.Text),
                new AppIconDefinition("Tips", "!", new Color(0.98f, 0.82f, 0.17f), IconStyle.Text),
                new AppIconDefinition("Stocks", "ST", new Color(0.16f, 0.16f, 0.18f), IconStyle.Text)
            },
            new[]
            {
                new AppIconDefinition("Memories", "ME", new Color(0.95f, 0.54f, 0.71f), IconStyle.Text),
                new AppIconDefinition("Dreams", "DR", new Color(0.54f, 0.38f, 0.98f), IconStyle.Text),
                new AppIconDefinition("Gallery", "GL", new Color(0.32f, 0.67f, 0.98f), IconStyle.Text),
                new AppIconDefinition("Love", "L", new Color(1.00f, 0.39f, 0.55f), IconStyle.Text),
                new AppIconDefinition("Games", "GM", new Color(0.46f, 0.31f, 0.96f), IconStyle.Text),
                new AppIconDefinition("Food", "FD", new Color(0.99f, 0.58f, 0.20f), IconStyle.Text),
                new AppIconDefinition("Reels", "RL", new Color(0.20f, 0.22f, 0.26f), IconStyle.Text),
                new AppIconDefinition("Photos 2", "P2", new Color(0.90f, 0.33f, 0.72f), IconStyle.Text),
                new AppIconDefinition("Wishlist", "WL", new Color(0.21f, 0.78f, 0.51f), IconStyle.Text),
                new AppIconDefinition("Trips", "TRP", new Color(0.25f, 0.66f, 0.95f), IconStyle.Text),
                new AppIconDefinition("Mood", "MD", new Color(0.58f, 0.44f, 1.00f), IconStyle.Text),
                new AppIconDefinition("Magic", "MG", new Color(0.99f, 0.68f, 0.24f), IconStyle.Text),
                new AppIconDefinition("Memes", "MM", new Color(0.17f, 0.20f, 0.27f), IconStyle.Text),
                new AppIconDefinition("Snacks", "SN", new Color(0.95f, 0.42f, 0.27f), IconStyle.Text),
                new AppIconDefinition("Date", "DT", new Color(0.98f, 0.45f, 0.67f), IconStyle.Text),
                new AppIconDefinition("Secret", "?", new Color(0.11f, 0.53f, 1.00f), IconStyle.Text)
            }
        };

        private static readonly TicketDefinition[] TicketDefinitions =
        {
            new TicketDefinition(
                "Ticket 01",
                "Cozy kitchen pick",
                "AMZ-KITCHEN-LOVE-01",
                "Swap this placeholder for a real Amazon code or item note later.",
                new Color(0.99f, 0.64f, 0.49f),
                new Color(1.00f, 0.84f, 0.64f),
                new Color(0.98f, 0.76f, 0.50f),
                new Color(0.98f, 0.49f, 0.38f)),
            new TicketDefinition(
                "Ticket 02",
                "Self-care wishlist pick",
                "AMZ-SWEET-GLOW-02",
                "This is another placeholder that is easy to replace with the real surprise.",
                new Color(0.96f, 0.57f, 0.78f),
                new Color(0.89f, 0.73f, 0.99f),
                new Color(0.95f, 0.65f, 0.86f),
                new Color(0.76f, 0.58f, 1.00f)),
            new TicketDefinition(
                "Ticket 03",
                "Cute date-night pick",
                "AMZ-DATE-NIGHT-03",
                "Replace this text with the final reveal for the third ticket whenever you are ready.",
                new Color(0.49f, 0.74f, 1.00f),
                new Color(0.46f, 0.97f, 0.81f),
                new Color(0.38f, 0.81f, 1.00f),
                new Color(0.33f, 0.96f, 0.73f))
        };

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetBootstrapFlag()
        {
            hasBootstrapped = false;
        }

        private void Awake()
        {
            if (hasBootstrapped)
            {
                Destroy(gameObject);
                return;
            }

            hasBootstrapped = true;
            DontDestroyOnLoad(gameObject);

            Application.targetFrameRate = 120;
            QualitySettings.vSyncCount = 0;

            BuildExperience();
            UpdateClock(true);
        }

        private void Update()
        {
            UpdateClock(false);
        }

        private void BuildExperience()
        {
            EnsureEventSystem();
            font = Resources.GetBuiltinResource<Font>("Arial.ttf");

            var canvasObject = new GameObject("Gift Phone Canvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasObject.transform.SetParent(transform, false);

            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 300;

            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1440f, 2960f);
            scaler.matchWidthOrHeight = 0.55f;

            var root = canvasObject.GetComponent<RectTransform>();
            Stretch(root);

            BuildBackdrop(root);

            var phoneRoot = CreateRect("PhoneRoot", root, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(PhoneWidth, PhoneHeight));
            var screenRoot = BuildPhoneFrame(phoneRoot);

            lockScreen = BuildLockScreen(screenRoot);
            homeScreen = BuildHomeScreen(screenRoot);
            appStoreScreen = BuildAppStoreScreen(screenRoot);
            scratcherScreen = BuildScratcherScreen(screenRoot);

            BuildPhoneChrome(screenRoot);

            SetScreenImmediate(lockScreen);
            SetCanvasGroup(homeScreen, 0f, false);
            SetCanvasGroup(appStoreScreen, 0f, false);
            SetCanvasGroup(scratcherScreen, 0f, false);
            RefreshInstallState();
        }

        private void EnsureEventSystem()
        {
            if (UnityEngine.Object.FindFirstObjectByType<EventSystem>() != null)
            {
                return;
            }

            var eventSystemObject = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            eventSystemObject.transform.SetParent(transform, false);
        }

        private void BuildBackdrop(RectTransform parent)
        {
            var backdrop = CreateRawImage("Backdrop", parent, GiftPhoneArt.GetBackdropTexture(), Color.white);
            Stretch(backdrop.rectTransform);

            var bloom = CreateRawImage("Backdrop Bloom", parent, GiftPhoneArt.GetBloomTexture(), new Color(1f, 1f, 1f, 0.92f));
            Stretch(bloom.rectTransform);

            var vignette = CreateImage("Backdrop Vignette", parent, GiftPhoneArt.GetRoundedSprite(), new Color(0.05f, 0.04f, 0.10f, 0.08f), true);
            Stretch(vignette.rectTransform, -180f);
        }

        private RectTransform BuildPhoneFrame(RectTransform parent)
        {
            var shadow = CreateImage("Phone Shadow", parent, GiftPhoneArt.GetRoundedSprite(), new Color(0f, 0f, 0f, 0.34f), true);
            SetRect(shadow.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -26f), new Vector2(PhoneWidth + 60f, PhoneHeight + 80f));

            var shell = CreateImage("Phone Shell", parent, GiftPhoneArt.GetRoundedSprite(), new Color(0.08f, 0.09f, 0.12f, 1f), true);
            SetRect(shell.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(PhoneWidth, PhoneHeight));
            AddShadow(shell, new Color(1f, 1f, 1f, 0.08f), new Vector2(0f, 2f));

            var bevel = CreateImage("Phone Bevel", shell.rectTransform, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.06f), true);
            Stretch(bevel.rectTransform, 8f);

            var glass = CreateRawImage("Phone Gloss", shell.rectTransform, GiftPhoneArt.GetGlossTexture(), new Color(1f, 1f, 1f, 0.15f));
            Stretch(glass.rectTransform, 10f);

            CreateSideButton(shell.rectTransform, new Vector2(-PhoneWidth * 0.5f - 6f, 210f), new Vector2(8f, 120f));
            CreateSideButton(shell.rectTransform, new Vector2(-PhoneWidth * 0.5f - 6f, 90f), new Vector2(8f, 82f));
            CreateSideButton(shell.rectTransform, new Vector2(-PhoneWidth * 0.5f - 6f, -10f), new Vector2(8f, 82f));
            CreateSideButton(shell.rectTransform, new Vector2(PhoneWidth * 0.5f + 6f, 100f), new Vector2(8f, 150f));

            var screenHolder = CreateRect("ScreenHolder", shell.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(ScreenWidth, ScreenHeight));
            var screenImage = screenHolder.gameObject.AddComponent<Image>();
            screenImage.sprite = GiftPhoneArt.GetScreenMaskSprite();
            screenImage.type = Image.Type.Sliced;
            screenImage.color = Color.white;
            var mask = screenHolder.gameObject.AddComponent<Mask>();
            mask.showMaskGraphic = false;

            var screenBack = CreateImage("Screen Back", screenHolder, GiftPhoneArt.GetScreenMaskSprite(), Color.black, true);
            Stretch(screenBack.rectTransform);
            screenBack.transform.SetAsFirstSibling();

            return screenHolder;
        }

        private CanvasGroup BuildLockScreen(RectTransform parent)
        {
            var root = CreateScreenRoot("Lock Screen", parent);
            AddWallpaper(root.transform, new Color(1f, 1f, 1f, 1f));

            var topGlow = CreateRawImage("Top Glow", root.transform, GiftPhoneArt.GetBloomTexture(), new Color(1f, 1f, 1f, 0.24f));
            SetRect(topGlow.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -60f), new Vector2(ScreenWidth * 0.95f, 260f));

            var lockLabel = CreateText("Lock Icon", root.transform, "LOCKED", 18, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.78f));
            SetRect(lockLabel.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -126f), new Vector2(220f, 32f));
            AddShadow(lockLabel, new Color(0f, 0f, 0f, 0.20f), new Vector2(0f, -1f));

            lockTimeText = CreateText("Lock Time", root.transform, "9:41", 118, TextAnchor.MiddleCenter, Color.white);
            SetRect(lockTimeText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -256f), new Vector2(460f, 140f));
            AddShadow(lockTimeText, new Color(0f, 0f, 0f, 0.22f), new Vector2(0f, -3f));

            lockDateText = CreateText("Lock Date", root.transform, "Saturday, March 7", 28, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.92f));
            SetRect(lockDateText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -354f), new Vector2(460f, 40f));

            var subtitleCard = CreateImage("Love Note", root.transform, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.15f), true);
            SetRect(subtitleCard.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -462f), new Vector2(420f, 110f));
            AddShadow(subtitleCard, new Color(0f, 0f, 0f, 0.12f), new Vector2(0f, 10f));

            var subtitle = CreateText("Lock Subtitle", subtitleCard.rectTransform, "A tiny app-store surprise waits inside.", 22, TextAnchor.MiddleCenter, Color.white);
            SetRect(subtitle.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(360f, 70f));

            var sliderCard = CreateImage("Unlock Card", root.transform, GiftPhoneArt.GetPillSprite(), new Color(1f, 1f, 1f, 0.18f), true);
            SetRect(sliderCard.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 154f), new Vector2(470f, 86f));
            AddShadow(sliderCard, new Color(0f, 0f, 0f, 0.18f), new Vector2(0f, 12f));

            unlockPromptText = CreateText("Unlock Prompt", sliderCard.rectTransform, "swipe to unlock", 24, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.78f));
            SetRect(unlockPromptText.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(340f, 34f));

            var shimmer = CreateRawImage("Unlock Shimmer", sliderCard.rectTransform, GiftPhoneArt.GetGlossTexture(), new Color(1f, 1f, 1f, 0.24f));
            Stretch(shimmer.rectTransform, 8f);

            var sliderRoot = new GameObject("Unlock Slider", typeof(RectTransform), typeof(Slider));
            sliderRoot.transform.SetParent(sliderCard.rectTransform, false);
            var sliderRect = sliderRoot.GetComponent<RectTransform>();
            Stretch(sliderRect, 10f);

            var slider = sliderRoot.GetComponent<Slider>();
            slider.transition = Selectable.Transition.None;
            slider.minValue = 0f;
            slider.maxValue = 1f;
            slider.value = 0f;
            slider.direction = Slider.Direction.LeftToRight;
            slider.targetGraphic = null;

            var background = CreateImage("Background", sliderRect, GiftPhoneArt.GetPillSprite(), new Color(1f, 1f, 1f, 0.04f), true);
            Stretch(background.rectTransform);
            slider.targetGraphic = background;

            var fillArea = CreateRect("Fill Area", sliderRect, new Vector2(0f, 0f), new Vector2(1f, 1f), Vector2.zero, Vector2.zero);
            Stretch(fillArea, 0f);
            var fill = CreateImage("Fill", fillArea, GiftPhoneArt.GetPillSprite(), new Color(1f, 1f, 1f, 0.12f), true);
            Stretch(fill.rectTransform);
            slider.fillRect = fill.rectTransform;

            var handleSlideArea = CreateRect("Handle Slide Area", sliderRect, new Vector2(0f, 0f), new Vector2(1f, 1f), Vector2.zero, Vector2.zero);
            Stretch(handleSlideArea, 0f);
            var handle = CreateImage("Handle", handleSlideArea, GiftPhoneArt.GetCircleSprite(), new Color(1f, 1f, 1f, 0.98f), false);
            SetRect(handle.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(30f, 0f), new Vector2(62f, 62f));
            AddShadow(handle, new Color(0f, 0f, 0f, 0.22f), new Vector2(0f, 8f));
            slider.handleRect = handle.rectTransform;

            var handleSheen = CreateRawImage("Handle Sheen", handle.rectTransform, GiftPhoneArt.GetGlossTexture(), new Color(1f, 1f, 1f, 0.26f));
            Stretch(handleSheen.rectTransform, 8f);

            var arrowShaft = CreateImage("Arrow Shaft", handle.rectTransform, GiftPhoneArt.GetWhiteSprite(), new Color(0.23f, 0.25f, 0.31f, 1f), false);
            SetRect(arrowShaft.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-2f, 0f), new Vector2(18f, 4f));
            var arrowHeadTop = CreateImage("Arrow Head Top", handle.rectTransform, GiftPhoneArt.GetWhiteSprite(), new Color(0.23f, 0.25f, 0.31f, 1f), false);
            SetRect(arrowHeadTop.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(8f, 6f), new Vector2(12f, 4f));
            arrowHeadTop.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 45f);
            var arrowHeadBottom = CreateImage("Arrow Head Bottom", handle.rectTransform, GiftPhoneArt.GetWhiteSprite(), new Color(0.23f, 0.25f, 0.31f, 1f), false);
            SetRect(arrowHeadBottom.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(8f, -6f), new Vector2(12f, 4f));
            arrowHeadBottom.rectTransform.localRotation = Quaternion.Euler(0f, 0f, -45f);

            unlockSlider = slider;
            var unlockController = sliderRoot.AddComponent<UnlockSliderController>();
            unlockController.Initialize(slider, OnUnlockProgress, UnlockPhone);

            CreateBottomQuickAction(root.transform, new Vector2(-210f, 82f), "LIGHT");
            CreateBottomQuickAction(root.transform, new Vector2(210f, 82f), "CAM");
            return root;
        }

        private CanvasGroup BuildHomeScreen(RectTransform parent)
        {
            var root = CreateScreenRoot("Home Screen", parent);
            AddWallpaper(root.transform, Color.white);

            var pager = new GameObject("Home Pager", typeof(RectTransform), typeof(Image), typeof(Mask), typeof(ScrollRect)).GetComponent<RectTransform>();
            pager.SetParent(root.transform, false);
            SetRect(pager, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -24f), new Vector2(ScreenWidth, PageViewportHeight));
            var pagerImage = pager.GetComponent<Image>();
            pagerImage.color = new Color(0f, 0f, 0f, 0.003f);
            pagerImage.sprite = GiftPhoneArt.GetRoundedSprite();
            pagerImage.type = Image.Type.Sliced;
            pager.GetComponent<Mask>().showMaskGraphic = false;

            var content = CreateRect("Content", pager, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 0f), new Vector2(ScreenWidth * HomePages.Length, PageViewportHeight), new Vector2(0f, 0.5f));

            for (var pageIndex = 0; pageIndex < HomePages.Length; pageIndex++)
            {
                var page = CreateRect("Page " + (pageIndex + 1), content, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(pageIndex * ScreenWidth, 0f), new Vector2(ScreenWidth, PageViewportHeight), new Vector2(0f, 0.5f));
                BuildAppPage(page, HomePages[pageIndex]);
            }

            var scrollRect = pager.GetComponent<ScrollRect>();
            scrollRect.horizontal = true;
            scrollRect.vertical = false;
            scrollRect.movementType = ScrollRect.MovementType.Clamped;
            scrollRect.inertia = true;
            scrollRect.decelerationRate = 0.12f;
            scrollRect.scrollSensitivity = 30f;
            scrollRect.viewport = pager;
            scrollRect.content = content;
            scrollRect.horizontalNormalizedPosition = 0f;

            var pagingController = pager.gameObject.AddComponent<PagedScrollController>();
            pagingController.Initialize(scrollRect, HomePages.Length, SetActivePageDot);

            var pageDotRoot = CreateRect("Page Dots", root.transform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 186f), new Vector2(140f, 20f));
            for (var index = 0; index < HomePages.Length; index++)
            {
                var dot = CreateImage("Dot " + index, pageDotRoot, GiftPhoneArt.GetCircleSprite(), index == 0 ? new Color(1f, 1f, 1f, 0.95f) : new Color(1f, 1f, 1f, 0.34f), false);
                SetRect(dot.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2((index - 1) * 24f, 0f), new Vector2(index == 0 ? 14f : 10f, index == 0 ? 14f : 10f));
                pageDots.Add(dot);
            }

            BuildDock(root.transform);
            return root;
        }

        private CanvasGroup BuildAppStoreScreen(RectTransform parent)
        {
            var root = CreateScreenRoot("App Store Screen", parent);

            var background = CreateRawImage("Store Background", root.transform, GiftPhoneArt.GetStoreTexture(), Color.white);
            Stretch(background.rectTransform);

            var headerTop = CreateText("Header Kicker", root.transform, "Today", 24, TextAnchor.UpperLeft, new Color(0.23f, 0.27f, 0.34f, 0.82f));
            SetRect(headerTop.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(34f, -148f), new Vector2(220f, 32f), new Vector2(0f, 0.5f));

            var header = CreateText("Header", root.transform, "App Store", 52, TextAnchor.UpperLeft, new Color(0.10f, 0.12f, 0.18f, 1f));
            SetRect(header.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(34f, -196f), new Vector2(360f, 64f), new Vector2(0f, 0.5f));

            CreateTopCircleButton(root.transform, new Vector2(54f, -92f), "<", ShowHomeScreen);

            var heroButtonObject = new GameObject("Eva Hero", typeof(RectTransform), typeof(Image), typeof(Button));
            heroButtonObject.transform.SetParent(root.transform, false);
            var heroRect = heroButtonObject.GetComponent<RectTransform>();
            SetRect(heroRect, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -430f), new Vector2(ScreenWidth - 56f, 360f));
            var heroImage = heroButtonObject.GetComponent<Image>();
            heroImage.sprite = GiftPhoneArt.GetRoundedSprite();
            heroImage.type = Image.Type.Sliced;
            heroImage.color = new Color(1f, 1f, 1f, 0.04f);
            AddShadow(heroImage, new Color(0f, 0f, 0f, 0.10f), new Vector2(0f, 16f));

            var heroBackdrop = CreateRawImage("Hero Backdrop", heroRect, GiftPhoneArt.GetHeroTexture(), Color.white);
            Stretch(heroBackdrop.rectTransform);

            var heroOverlay = CreateImage("Hero Overlay", heroRect, GiftPhoneArt.GetRoundedSprite(), new Color(0f, 0f, 0f, 0.08f), true);
            Stretch(heroOverlay.rectTransform);

            var heroEyebrow = CreateText("Hero Eyebrow", heroRect, "Featured for Eva", 20, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.78f));
            SetRect(heroEyebrow.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(28f, -28f), new Vector2(240f, 28f), new Vector2(0f, 0.5f));

            var heroTitle = CreateText("Hero Title", heroRect, "Eva's game", 58, TextAnchor.UpperLeft, Color.white);
            SetRect(heroTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(28f, -96f), new Vector2(360f, 64f), new Vector2(0f, 0.5f));
            AddShadow(heroTitle, new Color(0f, 0f, 0f, 0.18f), new Vector2(0f, -2f));

            var heroBody = CreateText("Hero Body", heroRect, "Tap get, watch it download, then open a scratch-off surprise made just for her.", 24, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.92f));
            SetRect(heroBody.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(28f, -164f), new Vector2(340f, 78f), new Vector2(0f, 0.5f));

            heroStatusText = CreateText("Hero Status", heroRect, "A custom mini-game hidden inside the phone.", 20, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.86f));
            SetRect(heroStatusText.rectTransform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(28f, 58f), new Vector2(360f, 32f), new Vector2(0f, 0.5f));

            var heroIcon = CreateImage("Hero Icon", heroRect, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.22f), true);
            SetRect(heroIcon.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-102f, 8f), new Vector2(156f, 156f));
            var heroIconGloss = CreateRawImage("Hero Icon Gloss", heroIcon.rectTransform, GiftPhoneArt.GetGlossTexture(), new Color(1f, 1f, 1f, 0.26f));
            Stretch(heroIconGloss.rectTransform, 8f);
            var heroIconLetter = CreateText("Hero Icon Letter", heroIcon.rectTransform, "E", 90, TextAnchor.MiddleCenter, Color.white);
            SetRect(heroIconLetter.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(120f, 110f));

            installButton = CreatePillButton(heroRect, new Vector2(98f, 118f), new Vector2(176f, 60f), StartDownloadOrOpen);
            installButtonBackground = installButton.GetComponent<Image>();
            installButtonBackground.color = Color.white;
            AddShadow(installButtonBackground, new Color(0f, 0f, 0f, 0.12f), new Vector2(0f, 8f));

            installArrowGroup = CreateRect("Install Arrow", installButton.transform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(34f, 0f), new Vector2(24f, 24f), new Vector2(0.5f, 0.5f));
            BuildDownloadArrow(installArrowGroup, new Color(0.14f, 0.50f, 0.96f, 1f));

            installLabelText = CreateText("Install Label", installButton.transform, "GET", 24, TextAnchor.MiddleCenter, new Color(0.14f, 0.50f, 0.96f, 1f));
            SetRect(installLabelText.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(10f, 0f), new Vector2(120f, 30f));

            installRingGroup = CreateCanvasGroup("Install Ring", installButton.transform);
            Stretch(installRingGroup.GetComponent<RectTransform>(), 10f);
            var ringBack = CreateImage("Ring Back", installRingGroup.transform, GiftPhoneArt.GetRingSprite(), new Color(0.14f, 0.50f, 0.96f, 0.18f), false);
            SetRect(ringBack.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(38f, 38f));
            installRingFill = CreateImage("Ring Fill", installRingGroup.transform, GiftPhoneArt.GetRingSprite(), new Color(0.14f, 0.50f, 0.96f, 1f), false);
            SetRect(installRingFill.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(38f, 38f));
            installRingFill.type = Image.Type.Filled;
            installRingFill.fillMethod = Image.FillMethod.Radial360;
            installRingFill.fillOrigin = (int)Image.Origin360.Top;
            installRingFill.fillAmount = 0f;
            var ringArrow = CreateRect("Ring Arrow", installRingGroup.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16f, 16f));
            BuildDownloadArrow(ringArrow, new Color(0.14f, 0.50f, 0.96f, 1f), 12f, 2f);

            installRingGroup.alpha = 0f;
            installRingGroup.blocksRaycasts = false;

            heroButtonObject.GetComponent<Button>().onClick.AddListener(StartDownloadOrOpen);

            var sectionTitle = CreateText("Section Title", root.transform, "For Eva", 30, TextAnchor.UpperLeft, new Color(0.10f, 0.12f, 0.18f, 1f));
            SetRect(sectionTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(34f, -632f), new Vector2(240f, 36f), new Vector2(0f, 0.5f));

            var rowTitles = new[]
            {
                "Cooking game 1",
                "Cooking game 2",
                "Cooking game 3",
                "TikTok"
            };

            var rowSubtitles = new[]
            {
                "temporary favorite placeholder",
                "temporary favorite placeholder",
                "temporary favorite placeholder",
                "for the current mood board"
            };

            var rowColors = new[]
            {
                new Color(1.00f, 0.69f, 0.39f),
                new Color(0.99f, 0.54f, 0.46f),
                new Color(0.98f, 0.63f, 0.75f),
                new Color(0.12f, 0.12f, 0.14f)
            };

            for (var index = 0; index < rowTitles.Length; index++)
            {
                BuildStoreRow(root.transform, 742f + index * 138f, rowTitles[index], rowSubtitles[index], rowColors[index], index == 3 ? "TT" : "CG");
            }

            return root;
        }

        private CanvasGroup BuildScratcherScreen(RectTransform parent)
        {
            var root = CreateScreenRoot("Scratcher Screen", parent);

            var background = CreateRawImage("Scratcher Background", root.transform, GiftPhoneArt.GetScratcherTexture(), Color.white);
            Stretch(background.rectTransform);

            CreateTopCircleButton(root.transform, new Vector2(54f, -92f), "<", ShowAppStoreScreen);
            CreateTopCircleButton(root.transform, new Vector2(-54f, -92f), "H", ShowHomeScreen, new Vector2(1f, 1f), new Vector2(1f, 1f));

            var title = CreateText("Game Title", root.transform, "Eva Scratchers", 50, TextAnchor.UpperLeft, Color.white);
            SetRect(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(34f, -150f), new Vector2(420f, 64f), new Vector2(0f, 0.5f));
            AddShadow(title, new Color(0f, 0f, 0f, 0.18f), new Vector2(0f, -2f));

            var subtitleCard = CreateImage("Game Subtitle Card", root.transform, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.14f), true);
            SetRect(subtitleCard.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -258f), new Vector2(ScreenWidth - 52f, 108f));
            var subtitle = CreateText("Game Subtitle", subtitleCard.rectTransform, "Scratch all three tickets to reveal the surprise Amazon codes inside.", 22, TextAnchor.MiddleCenter, Color.white);
            SetRect(subtitle.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(ScreenWidth - 120f, 62f));

            for (var index = 0; index < TicketDefinitions.Length; index++)
            {
                var y = -420f - (index * 246f);
                BuildTicket(root.transform, TicketDefinitions[index], y);
            }

            var finalGroup = CreateCanvasGroup("Final Reveal", root.transform);
            SetRect(finalGroup.GetComponent<RectTransform>(), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 58f), new Vector2(ScreenWidth - 74f, 92f));
            var finalBack = CreateImage("Final Reveal Back", finalGroup.transform, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.18f), true);
            Stretch(finalBack.rectTransform);
            finalRevealText = CreateText("Final Reveal Text", finalGroup.transform, "All three tickets are open. Replace the placeholders with her real Amazon gifts whenever you're ready.", 20, TextAnchor.MiddleCenter, Color.white);
            Stretch(finalRevealText.rectTransform, 18f);
            finalGroup.alpha = 0f;
            finalGroup.blocksRaycasts = false;
            finalGroup.interactable = false;

            return root;
        }

        private void BuildPhoneChrome(RectTransform parent)
        {
            var chrome = CreateRect("Chrome", parent, new Vector2(0f, 0f), new Vector2(1f, 1f), Vector2.zero, Vector2.zero);
            Stretch(chrome);

            var island = CreateImage("Dynamic Island", chrome, GiftPhoneArt.GetPillSprite(), new Color(0.05f, 0.06f, 0.08f, 0.96f), true);
            SetRect(island.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -30f), new Vector2(182f, 42f));

            statusTimeText = CreateText("Status Time", chrome, "9:41", 20, TextAnchor.MiddleLeft, Color.white);
            SetRect(statusTimeText.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(30f, -40f), new Vector2(120f, 28f), new Vector2(0f, 0.5f));

            var statusIcons = CreateRect("Status Icons", chrome, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-26f, -40f), new Vector2(120f, 28f), new Vector2(1f, 0.5f));
            BuildStatusIcons(statusIcons);

            var homeIndicator = CreateImage("Home Indicator", chrome, GiftPhoneArt.GetPillSprite(), new Color(1f, 1f, 1f, 0.92f), true);
            SetRect(homeIndicator.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 20f), new Vector2(172f, 10f));
        }

        private void BuildStatusIcons(RectTransform parent)
        {
            for (var index = 0; index < 4; index++)
            {
                var bar = CreateImage("Signal " + index, parent, GiftPhoneArt.GetWhiteSprite(), new Color(1f, 1f, 1f, 0.96f), false);
                SetRect(bar.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-94f + index * 8f, -2f + index * 2f), new Vector2(4f, 8f + index * 4f), new Vector2(0.5f, 0f));
            }

            var wifiArcOne = CreateImage("Wifi One", parent, GiftPhoneArt.GetWhiteSprite(), new Color(1f, 1f, 1f, 0.92f), false);
            SetRect(wifiArcOne.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-52f, 0f), new Vector2(18f, 3f));
            wifiArcOne.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 12f);
            var wifiArcTwo = CreateImage("Wifi Two", parent, GiftPhoneArt.GetWhiteSprite(), new Color(1f, 1f, 1f, 0.72f), false);
            SetRect(wifiArcTwo.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-52f, -5f), new Vector2(14f, 3f));
            wifiArcTwo.rectTransform.localRotation = Quaternion.Euler(0f, 0f, -12f);

            var battery = CreateImage("Battery", parent, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.20f), true);
            SetRect(battery.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-18f, 0f), new Vector2(30f, 16f), new Vector2(1f, 0.5f));
            var batteryFill = CreateImage("Battery Fill", battery.rectTransform, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.96f), true);
            SetRect(batteryFill.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(10f, 0f), new Vector2(18f, 10f), new Vector2(0f, 0.5f));
            var batteryCap = CreateImage("Battery Cap", parent, GiftPhoneArt.GetWhiteSprite(), new Color(1f, 1f, 1f, 0.92f), false);
            SetRect(batteryCap.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-2f, 0f), new Vector2(3f, 8f), new Vector2(1f, 0.5f));
        }

        private void BuildAppPage(RectTransform parent, AppIconDefinition[] definitions)
        {
            const float iconSpacingX = 134f;
            const float iconSpacingY = 172f;
            const float startX = 96f;
            const float startY = -96f;

            for (var index = 0; index < definitions.Length; index++)
            {
                var row = index / 4;
                var column = index % 4;
                var position = new Vector2(startX + column * iconSpacingX, startY - row * iconSpacingY);
                CreateAppIcon(parent, definitions[index], position);
            }
        }

        private void BuildDock(Transform parent)
        {
            var dock = CreateImage("Dock", parent, GiftPhoneArt.GetPillSprite(), new Color(1f, 1f, 1f, 0.17f), true);
            SetRect(dock.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 82f), new Vector2(ScreenWidth - 36f, 124f));
            AddShadow(dock, new Color(0f, 0f, 0f, 0.10f), new Vector2(0f, 10f));

            var dockApps = new[]
            {
                new AppIconDefinition("Phone", "TEL", new Color(0.23f, 0.81f, 0.40f), IconStyle.Text),
                new AppIconDefinition("Safari", "SAF", new Color(0.25f, 0.72f, 1.00f), IconStyle.Text),
                new AppIconDefinition("Music", "MUS", new Color(0.95f, 0.19f, 0.48f), IconStyle.Text),
                new AppIconDefinition("Messages", "MSG", new Color(0.19f, 0.79f, 0.36f), IconStyle.Messages)
            };

            for (var index = 0; index < dockApps.Length; index++)
            {
                var x = -192f + index * 128f;
                var iconRoot = CreateRect("Dock App " + index, dock.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(x, 0f), new Vector2(98f, 98f));
                CreateAppIconGraphic(iconRoot, dockApps[index], new Vector2(94f, 94f));
            }
        }

        private void BuildStoreRow(Transform parent, float yOffset, string title, string subtitle, Color color, string glyph)
        {
            var row = CreateImage("Store Row " + title, parent, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.62f), true);
            SetRect(row.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -yOffset), new Vector2(ScreenWidth - 56f, 112f));

            var iconRoot = CreateRect("Icon", row.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(64f, 0f), new Vector2(74f, 74f));
            var iconBack = CreateImage("Icon Back", iconRoot, GiftPhoneArt.GetRoundedSprite(), color, true);
            Stretch(iconBack.rectTransform);
            var iconGloss = CreateRawImage("Icon Gloss", iconRoot, GiftPhoneArt.GetGlossTexture(), new Color(1f, 1f, 1f, 0.18f));
            Stretch(iconGloss.rectTransform, 4f);
            var iconText = CreateText("Icon Text", iconRoot, glyph, 24, TextAnchor.MiddleCenter, title == "TikTok" ? Color.white : new Color(1f, 1f, 1f, 0.96f));
            Stretch(iconText.rectTransform);

            var rowTitle = CreateText("Title", row.rectTransform, title, 26, TextAnchor.UpperLeft, new Color(0.10f, 0.12f, 0.18f, 1f));
            SetRect(rowTitle.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(120f, 14f), new Vector2(220f, 32f), new Vector2(0f, 0.5f));

            var rowSubtitle = CreateText("Subtitle", row.rectTransform, subtitle, 18, TextAnchor.UpperLeft, new Color(0.35f, 0.38f, 0.45f, 1f));
            SetRect(rowSubtitle.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(120f, -20f), new Vector2(260f, 24f), new Vector2(0f, 0.5f));

            var getButton = CreatePillButton(row.rectTransform, new Vector2(-72f, 0f), new Vector2(112f, 44f), null, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f));
            getButton.GetComponent<Image>().color = new Color(0.14f, 0.50f, 0.96f, 0.12f);
            getButton.interactable = false;
            var getLabel = CreateText("Get Label", getButton.transform, "GET", 20, TextAnchor.MiddleCenter, new Color(0.14f, 0.50f, 0.96f, 1f));
            Stretch(getLabel.rectTransform);
        }

        private void BuildTicket(Transform parent, TicketDefinition definition, float yOffset)
        {
            var ticketRoot = CreateRect("Ticket " + definition.Tag, parent, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, yOffset), new Vector2(ScreenWidth - 54f, 210f));
            var shadow = CreateImage("Shadow", ticketRoot, GiftPhoneArt.GetRoundedSprite(), new Color(0f, 0f, 0f, 0.18f), true);
            SetRect(shadow.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -12f), new Vector2(ScreenWidth - 42f, 214f));

            var back = CreateImage("Back", ticketRoot, GiftPhoneArt.GetRoundedSprite(), definition.BackPrimary, true);
            Stretch(back.rectTransform);

            var backGlow = CreateRawImage("Back Glow", ticketRoot, GiftPhoneArt.GetGlossTexture(), new Color(1f, 1f, 1f, 0.20f));
            Stretch(backGlow.rectTransform, 6f);

            var accent = CreateImage("Accent Strip", ticketRoot, GiftPhoneArt.GetRoundedSprite(), definition.BackSecondary, true);
            SetRect(accent.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, -16f), new Vector2(0f, 52f), new Vector2(0.5f, 1f));

            var tag = CreateText("Tag", ticketRoot, definition.Tag, 18, TextAnchor.MiddleLeft, new Color(1f, 1f, 1f, 0.88f));
            SetRect(tag.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -26f), new Vector2(120f, 24f), new Vector2(0f, 0.5f));

            var title = CreateText("Title", ticketRoot, definition.Title, 28, TextAnchor.UpperLeft, Color.white);
            SetRect(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -72f), new Vector2(320f, 34f), new Vector2(0f, 0.5f));

            var codeLabel = CreateText("Code Label", ticketRoot, "Amazon code", 18, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.78f));
            SetRect(codeLabel.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -114f), new Vector2(160f, 24f), new Vector2(0f, 0.5f));

            var codeText = CreateText("Code Text", ticketRoot, definition.Code, 30, TextAnchor.UpperLeft, Color.white);
            SetRect(codeText.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -150f), new Vector2(420f, 34f), new Vector2(0f, 0.5f));
            AddShadow(codeText, new Color(0f, 0f, 0f, 0.15f), new Vector2(0f, -2f));

            var note = CreateText("Note", ticketRoot, definition.Note, 16, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.76f));
            SetRect(note.rectTransform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(22f, 22f), new Vector2(420f, 40f), new Vector2(0f, 0.5f));

            var revealBadge = CreateImage("Reveal Badge", ticketRoot, GiftPhoneArt.GetPillSprite(), new Color(1f, 1f, 1f, 0.16f), true);
            SetRect(revealBadge.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-22f, -26f), new Vector2(116f, 36f), new Vector2(1f, 0.5f));
            var revealBadgeText = CreateText("Reveal Badge Text", revealBadge.rectTransform, "locked", 16, TextAnchor.MiddleCenter, Color.white);
            Stretch(revealBadgeText.rectTransform);

            var overlayGroup = CreateCanvasGroup("Scratch Overlay", ticketRoot);
            Stretch(overlayGroup.GetComponent<RectTransform>(), 6f);

            var cover = CreateRawImage("Scratch Cover", overlayGroup.transform, GiftPhoneArt.CreateScratchCoverTexture(512, 192, definition.CoverPrimary, definition.CoverSecondary), Color.white);
            Stretch(cover.rectTransform);
            cover.raycastTarget = true;

            var overlayTitle = CreateText("Overlay Title", overlayGroup.transform, "SCRATCH TO REVEAL", 24, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.92f));
            SetRect(overlayTitle.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 0f), new Vector2(320f, 34f));

            var overlayHint = CreateText("Overlay Hint", overlayGroup.transform, "three hidden gifts inside", 16, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.72f));
            SetRect(overlayHint.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -26f), new Vector2(220f, 24f));

            var ticketController = overlayGroup.gameObject.AddComponent<ScratchTicketController>();
            ticketController.Initialize(cover, overlayGroup, () =>
            {
                revealBadgeText.text = "open";
                revealBadge.color = new Color(1f, 1f, 1f, 0.28f);
                HandleTicketReveal();
            });
            scratchTickets.Add(ticketController);
        }

        private void CreateBottomQuickAction(Transform parent, Vector2 position, string label)
        {
            var circle = CreateImage("Quick Action " + label, parent, GiftPhoneArt.GetCircleSprite(), new Color(1f, 1f, 1f, 0.18f), false);
            SetRect(circle.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), position, new Vector2(70f, 70f));
            var text = CreateText("Quick Label", circle.rectTransform, label, 16, TextAnchor.MiddleCenter, Color.white);
            Stretch(text.rectTransform);
        }

        private void CreateSideButton(Transform parent, Vector2 position, Vector2 size)
        {
            var button = CreateImage("Side Button", parent, GiftPhoneArt.GetPillSprite(), new Color(0.24f, 0.25f, 0.29f, 1f), true);
            SetRect(button.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), position, size);
        }

        private void CreateAppIcon(RectTransform parent, AppIconDefinition definition, Vector2 position)
        {
            var itemRoot = CreateRect(definition.Name, parent, new Vector2(0f, 1f), new Vector2(0f, 1f), position, new Vector2(110f, 150f), new Vector2(0.5f, 0.5f));
            var buttonRect = CreateRect("Button", itemRoot, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -6f), new Vector2(110f, 110f));
            var button = buttonRect.gameObject.AddComponent<Button>();
            button.transition = Selectable.Transition.ColorTint;
            button.targetGraphic = CreateAppIconGraphic(buttonRect, definition, new Vector2(110f, 110f));
            if (definition.OpensAppStore)
            {
                button.onClick.AddListener(ShowAppStoreScreen);
            }

            var colors = button.colors;
            colors.normalColor = Color.white;
            colors.highlightedColor = new Color(0.92f, 0.92f, 0.92f, 1f);
            colors.pressedColor = new Color(0.84f, 0.84f, 0.84f, 1f);
            colors.selectedColor = Color.white;
            colors.fadeDuration = 0.08f;
            button.colors = colors;

            var label = CreateText("Label", itemRoot, definition.Name, 16, TextAnchor.UpperCenter, Color.white);
            SetRect(label.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 8f), new Vector2(120f, 26f));
            AddShadow(label, new Color(0f, 0f, 0f, 0.22f), new Vector2(0f, -1f));
        }

        private Image CreateAppIconGraphic(RectTransform parent, AppIconDefinition definition, Vector2 size)
        {
            var shadow = CreateImage("Shadow", parent, GiftPhoneArt.GetRoundedSprite(), new Color(0f, 0f, 0f, 0.18f), true);
            SetRect(shadow.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 8f), size);

            var back = CreateImage("Back", parent, GiftPhoneArt.GetRoundedSprite(), definition.BackColor, true);
            SetRect(back.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, size);

            var outline = CreateImage("Outline", back.rectTransform, GiftPhoneArt.GetRoundedSprite(), new Color(1f, 1f, 1f, 0.10f), true);
            Stretch(outline.rectTransform, 2f);

            var gloss = CreateRawImage("Gloss", back.rectTransform, GiftPhoneArt.GetGlossTexture(), new Color(1f, 1f, 1f, 0.20f));
            Stretch(gloss.rectTransform, 4f);

            switch (definition.Style)
            {
                case IconStyle.AppStore:
                    BuildAppStoreGlyph(back.rectTransform, definition.ForegroundColor);
                    break;
                case IconStyle.Messages:
                    BuildMessageGlyph(back.rectTransform, definition.ForegroundColor);
                    break;
                case IconStyle.Notes:
                    BuildNotesGlyph(back.rectTransform, definition.ForegroundColor);
                    break;
                case IconStyle.Calendar:
                    BuildCalendarGlyph(back.rectTransform);
                    break;
                case IconStyle.Camera:
                    BuildCameraGlyph(back.rectTransform);
                    break;
                case IconStyle.TikTok:
                    BuildTikTokGlyph(back.rectTransform);
                    break;
                default:
                    var text = CreateText("Glyph", back.rectTransform, definition.Glyph, definition.Glyph.Length > 2 ? 24 : 38, TextAnchor.MiddleCenter, definition.ForegroundColor);
                    Stretch(text.rectTransform, 12f);
                    break;
            }

            return back;
        }

        private void BuildAppStoreGlyph(Transform parent, Color color)
        {
            for (var index = 0; index < 3; index++)
            {
                var line = CreateImage("Line " + index, parent, GiftPhoneArt.GetWhiteSprite(), color, false);
                SetRect(line.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), index == 0 ? new Vector2(-10f, 4f) : index == 1 ? new Vector2(10f, 4f) : new Vector2(0f, -12f), new Vector2(10f, 42f));
                line.rectTransform.localRotation = Quaternion.Euler(0f, 0f, index == 0 ? 30f : index == 1 ? -30f : 90f);
            }
        }

        private void BuildMessageGlyph(Transform parent, Color color)
        {
            var bubble = CreateImage("Bubble", parent, GiftPhoneArt.GetRoundedSprite(), color, true);
            SetRect(bubble.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -4f), new Vector2(60f, 48f));
            var tail = CreateImage("Tail", parent, GiftPhoneArt.GetWhiteSprite(), color, false);
            SetRect(tail.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-12f, -28f), new Vector2(14f, 14f));
            tail.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 45f);
            for (var index = 0; index < 3; index++)
            {
                var dot = CreateImage("Dot " + index, bubble.rectTransform, GiftPhoneArt.GetCircleSprite(), new Color(0.19f, 0.79f, 0.36f, 1f), false);
                SetRect(dot.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2((index - 1) * 14f, 0f), new Vector2(8f, 8f));
            }
        }

        private void BuildNotesGlyph(Transform parent, Color color)
        {
            var sheet = CreateImage("Sheet", parent, GiftPhoneArt.GetRoundedSprite(), Color.white, true);
            SetRect(sheet.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(60f, 70f));
            var topBand = CreateImage("Top Band", sheet.rectTransform, GiftPhoneArt.GetRoundedSprite(), new Color(0.96f, 0.84f, 0.24f, 1f), true);
            SetRect(topBand.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, -10f), new Vector2(0f, 18f), new Vector2(0.5f, 1f));
            for (var index = 0; index < 3; index++)
            {
                var line = CreateImage("Line " + index, sheet.rectTransform, GiftPhoneArt.GetWhiteSprite(), color, false);
                SetRect(line.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 8f - index * 14f), new Vector2(34f, 3f));
            }
        }

        private void BuildCalendarGlyph(Transform parent)
        {
            var page = CreateImage("Page", parent, GiftPhoneArt.GetRoundedSprite(), Color.white, true);
            SetRect(page.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(62f, 70f));
            var top = CreateImage("Top", page.rectTransform, GiftPhoneArt.GetRoundedSprite(), new Color(0.94f, 0.24f, 0.23f, 1f), true);
            SetRect(top.rectTransform, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, -10f), new Vector2(0f, 20f), new Vector2(0.5f, 1f));
            var date = CreateText("Date", page.rectTransform, "14", 30, TextAnchor.MiddleCenter, new Color(0.14f, 0.16f, 0.20f, 1f));
            SetRect(date.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -6f), new Vector2(60f, 38f));
        }

        private void BuildCameraGlyph(Transform parent)
        {
            var body = CreateImage("Body", parent, GiftPhoneArt.GetRoundedSprite(), new Color(0.92f, 0.94f, 0.97f, 1f), true);
            SetRect(body.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 0f), new Vector2(62f, 42f));
            var lens = CreateImage("Lens", body.rectTransform, GiftPhoneArt.GetCircleSprite(), new Color(0.16f, 0.18f, 0.22f, 1f), false);
            SetRect(lens.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(24f, 24f));
            var flash = CreateImage("Flash", body.rectTransform, GiftPhoneArt.GetCircleSprite(), new Color(0.84f, 0.88f, 0.93f, 1f), false);
            SetRect(flash.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-12f, -8f), new Vector2(8f, 8f), new Vector2(1f, 1f));
        }

        private void BuildTikTokGlyph(Transform parent)
        {
            var cyan = CreateImage("Cyan", parent, GiftPhoneArt.GetWhiteSprite(), new Color(0.20f, 0.93f, 0.89f, 1f), false);
            SetRect(cyan.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-4f, 2f), new Vector2(8f, 36f));
            var cyanTop = CreateImage("Cyan Top", parent, GiftPhoneArt.GetWhiteSprite(), new Color(0.20f, 0.93f, 0.89f, 1f), false);
            SetRect(cyanTop.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(6f, 16f), new Vector2(24f, 8f));
            var pink = CreateImage("Pink", parent, GiftPhoneArt.GetWhiteSprite(), new Color(1.00f, 0.30f, 0.54f, 1f), false);
            SetRect(pink.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(2f, -2f), new Vector2(8f, 36f));
            var pinkDot = CreateImage("Pink Dot", parent, GiftPhoneArt.GetCircleSprite(), new Color(1.00f, 0.30f, 0.54f, 1f), false);
            SetRect(pinkDot.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-8f, -18f), new Vector2(18f, 18f));
            var whiteStem = CreateImage("White Stem", parent, GiftPhoneArt.GetWhiteSprite(), Color.white, false);
            SetRect(whiteStem.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 0f), new Vector2(8f, 36f));
            var whiteTop = CreateImage("White Top", parent, GiftPhoneArt.GetWhiteSprite(), Color.white, false);
            SetRect(whiteTop.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(10f, 16f), new Vector2(24f, 8f));
            var whiteDot = CreateImage("White Dot", parent, GiftPhoneArt.GetCircleSprite(), Color.white, false);
            SetRect(whiteDot.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-4f, -16f), new Vector2(18f, 18f));
        }

        private void BuildDownloadArrow(Transform parent, Color color, float shaftHeight = 16f, float shaftWidth = 3f)
        {
            var shaft = CreateImage("Shaft", parent, GiftPhoneArt.GetWhiteSprite(), color, false);
            SetRect(shaft.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 2f), new Vector2(shaftWidth, shaftHeight));

            var left = CreateImage("Left", parent, GiftPhoneArt.GetWhiteSprite(), color, false);
            SetRect(left.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-4f, -5f), new Vector2(shaftWidth, 10f));
            left.rectTransform.localRotation = Quaternion.Euler(0f, 0f, -45f);

            var right = CreateImage("Right", parent, GiftPhoneArt.GetWhiteSprite(), color, false);
            SetRect(right.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(4f, -5f), new Vector2(shaftWidth, 10f));
            right.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 45f);
        }

        private Button CreateTopCircleButton(Transform parent, Vector2 anchoredPosition, string label, Action onClick, Vector2? anchorMin = null, Vector2? anchorMax = null)
        {
            var button = CreateCircleButton(parent, anchoredPosition, new Vector2(54f, 54f), onClick, anchorMin ?? new Vector2(0f, 1f), anchorMax ?? new Vector2(0f, 1f));
            var text = CreateText("Label", button.transform, label, 24, TextAnchor.MiddleCenter, Color.white);
            Stretch(text.rectTransform);
            return button;
        }

        private Button CreateCircleButton(Transform parent, Vector2 anchoredPosition, Vector2 size, Action onClick, Vector2 anchorMin, Vector2 anchorMax)
        {
            var buttonObject = new GameObject("Circle Button", typeof(RectTransform), typeof(Image), typeof(Button));
            buttonObject.transform.SetParent(parent, false);
            var rect = buttonObject.GetComponent<RectTransform>();
            SetRect(rect, anchorMin, anchorMax, anchoredPosition, size);

            var image = buttonObject.GetComponent<Image>();
            image.sprite = GiftPhoneArt.GetCircleSprite();
            image.type = Image.Type.Simple;
            image.color = new Color(1f, 1f, 1f, 0.16f);
            AddShadow(image, new Color(0f, 0f, 0f, 0.12f), new Vector2(0f, 8f));

            var button = buttonObject.GetComponent<Button>();
            button.transition = Selectable.Transition.ColorTint;
            if (onClick != null)
            {
                button.onClick.AddListener(() => onClick());
            }

            var colors = button.colors;
            colors.normalColor = Color.white;
            colors.highlightedColor = new Color(0.90f, 0.90f, 0.90f, 1f);
            colors.pressedColor = new Color(0.82f, 0.82f, 0.82f, 1f);
            colors.selectedColor = Color.white;
            colors.fadeDuration = 0.08f;
            button.colors = colors;
            return button;
        }

        private Button CreatePillButton(Transform parent, Vector2 anchoredPosition, Vector2 size, Action onClick, Vector2? anchorMin = null, Vector2? anchorMax = null)
        {
            var buttonObject = new GameObject("Pill Button", typeof(RectTransform), typeof(Image), typeof(Button));
            buttonObject.transform.SetParent(parent, false);
            var rect = buttonObject.GetComponent<RectTransform>();
            SetRect(rect, anchorMin ?? new Vector2(0f, 0f), anchorMax ?? new Vector2(0f, 0f), anchoredPosition, size);

            var image = buttonObject.GetComponent<Image>();
            image.sprite = GiftPhoneArt.GetPillSprite();
            image.type = Image.Type.Sliced;
            image.color = Color.white;

            var button = buttonObject.GetComponent<Button>();
            button.transition = Selectable.Transition.ColorTint;
            if (onClick != null)
            {
                button.onClick.AddListener(() => onClick());
            }

            var colors = button.colors;
            colors.normalColor = Color.white;
            colors.highlightedColor = new Color(0.92f, 0.92f, 0.92f, 1f);
            colors.pressedColor = new Color(0.86f, 0.86f, 0.86f, 1f);
            colors.selectedColor = Color.white;
            colors.fadeDuration = 0.08f;
            button.colors = colors;
            return button;
        }

        private CanvasGroup CreateScreenRoot(string name, Transform parent)
        {
            var root = CreateCanvasGroup(name, parent);
            Stretch(root.GetComponent<RectTransform>());
            return root;
        }

        private CanvasGroup CreateCanvasGroup(string name, Transform parent)
        {
            var groupObject = new GameObject(name, typeof(RectTransform), typeof(CanvasGroup));
            groupObject.transform.SetParent(parent, false);
            return groupObject.GetComponent<CanvasGroup>();
        }

        private void AddWallpaper(Transform parent, Color tint)
        {
            var wallpaper = CreateRawImage("Wallpaper", parent, GiftPhoneArt.GetWallpaperTexture(), tint);
            Stretch(wallpaper.rectTransform);

            var topShade = CreateRawImage("Wallpaper Shade", parent, GiftPhoneArt.GetGlossTexture(), new Color(0f, 0f, 0f, 0.12f));
            Stretch(topShade.rectTransform);
        }

        private void OnUnlockProgress(float value)
        {
            if (unlockPromptText == null)
            {
                return;
            }

            var color = unlockPromptText.color;
            color.a = Mathf.Lerp(0.78f, 0.12f, value);
            unlockPromptText.color = color;
        }

        private void UnlockPhone()
        {
            if (unlockSlider != null)
            {
                unlockSlider.interactable = false;
            }

            ShowHomeScreen();
        }

        private void ShowHomeScreen()
        {
            ShowScreen(homeScreen);
        }

        private void ShowAppStoreScreen()
        {
            ShowScreen(appStoreScreen);
        }

        private void OpenEvaGame()
        {
            ShowScreen(scratcherScreen);
        }

        private void StartDownloadOrOpen()
        {
            if (downloadInProgress)
            {
                return;
            }

            if (appInstalled)
            {
                OpenEvaGame();
                return;
            }

            if (downloadRoutine != null)
            {
                StopCoroutine(downloadRoutine);
            }

            downloadRoutine = StartCoroutine(DownloadSequence());
        }

        private IEnumerator DownloadSequence()
        {
            downloadInProgress = true;
            installRingFill.fillAmount = 0f;
            RefreshInstallState();

            const float duration = 2.6f;
            var elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                var normalized = Mathf.Clamp01(elapsed / duration);
                var eased = Mathf.SmoothStep(0f, 1f, normalized);
                installRingFill.fillAmount = eased;
                heroStatusText.text = "Downloading surprise... " + Mathf.RoundToInt(eased * 100f) + "%";
                yield return null;
            }

            downloadInProgress = false;
            appInstalled = true;
            RefreshInstallState();
            heroStatusText.text = "Installed. Opening Eva Scratchers...";
            yield return new WaitForSeconds(0.55f);
            OpenEvaGame();
        }

        private void RefreshInstallState()
        {
            if (installButtonBackground == null || installLabelText == null || installArrowGroup == null || installRingGroup == null || heroStatusText == null)
            {
                return;
            }

            if (downloadInProgress)
            {
                installButton.interactable = false;
                installButtonBackground.color = Color.white;
                installLabelText.gameObject.SetActive(false);
                installArrowGroup.gameObject.SetActive(false);
                installRingGroup.alpha = 1f;
                heroStatusText.text = "Downloading surprise...";
                return;
            }

            installRingGroup.alpha = 0f;
            installButton.interactable = true;

            if (appInstalled)
            {
                installButtonBackground.color = new Color(0.14f, 0.50f, 0.96f, 1f);
                installArrowGroup.gameObject.SetActive(false);
                installLabelText.gameObject.SetActive(true);
                installLabelText.text = "OPEN";
                installLabelText.color = Color.white;
                installLabelText.rectTransform.anchoredPosition = Vector2.zero;
                heroStatusText.text = "Installed. Tap open to launch Eva Scratchers.";
                return;
            }

            installButtonBackground.color = Color.white;
            installArrowGroup.gameObject.SetActive(true);
            installLabelText.gameObject.SetActive(true);
            installLabelText.text = "GET";
            installLabelText.color = new Color(0.14f, 0.50f, 0.96f, 1f);
            installLabelText.rectTransform.anchoredPosition = new Vector2(10f, 0f);
            heroStatusText.text = "A custom mini-game hidden inside the phone.";
        }

        private void HandleTicketReveal()
        {
            revealedTicketCount = Mathf.Min(TicketDefinitions.Length, revealedTicketCount + 1);
            if (revealedTicketCount < TicketDefinitions.Length || finalRevealText == null)
            {
                return;
            }

            var finalGroup = finalRevealText.transform.parent.GetComponent<CanvasGroup>();
            if (finalGroup != null)
            {
                StartCoroutine(FadeInGroup(finalGroup, 0.35f));
            }
        }

        private IEnumerator FadeInGroup(CanvasGroup group, float duration)
        {
            group.blocksRaycasts = false;
            group.interactable = false;
            var elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                group.alpha = Mathf.Clamp01(elapsed / duration);
                yield return null;
            }

            group.alpha = 1f;
        }

        private void SetActivePageDot(int index)
        {
            for (var dotIndex = 0; dotIndex < pageDots.Count; dotIndex++)
            {
                var isActive = dotIndex == index;
                pageDots[dotIndex].color = isActive ? new Color(1f, 1f, 1f, 0.95f) : new Color(1f, 1f, 1f, 0.34f);
                pageDots[dotIndex].rectTransform.sizeDelta = isActive ? new Vector2(14f, 14f) : new Vector2(10f, 10f);
            }
        }

        private void ShowScreen(CanvasGroup target)
        {
            if (target == null || target == activeScreen)
            {
                return;
            }

            if (transitionRoutine != null)
            {
                StopCoroutine(transitionRoutine);
            }

            transitionRoutine = StartCoroutine(TransitionScreens(activeScreen, target));
        }

        private IEnumerator TransitionScreens(CanvasGroup from, CanvasGroup to)
        {
            var duration = 0.28f;
            var elapsed = 0f;

            if (to != null)
            {
                to.alpha = 0f;
                to.blocksRaycasts = false;
                to.interactable = false;
            }

            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                var t = Mathf.Clamp01(elapsed / duration);
                if (from != null)
                {
                    from.alpha = 1f - t;
                }

                if (to != null)
                {
                    to.alpha = t;
                }

                yield return null;
            }

            if (from != null)
            {
                SetCanvasGroup(from, 0f, false);
            }

            if (to != null)
            {
                SetCanvasGroup(to, 1f, true);
                activeScreen = to;
            }
        }

        private void SetScreenImmediate(CanvasGroup target)
        {
            activeScreen = target;
            SetCanvasGroup(target, 1f, true);
        }

        private static void SetCanvasGroup(CanvasGroup group, float alpha, bool interactable)
        {
            if (group == null)
            {
                return;
            }

            group.alpha = alpha;
            group.interactable = interactable;
            group.blocksRaycasts = interactable;
        }

        private void UpdateClock(bool force)
        {
            var now = DateTime.Now;
            if (!force && now.Minute == lastClockTime.Minute && now.Hour == lastClockTime.Hour)
            {
                return;
            }

            lastClockTime = now;
            var timeValue = now.ToString("h:mm");
            var dateValue = now.ToString("dddd, MMMM d");

            if (statusTimeText != null)
            {
                statusTimeText.text = timeValue;
            }

            if (lockTimeText != null)
            {
                lockTimeText.text = timeValue;
            }

            if (lockDateText != null)
            {
                lockDateText.text = dateValue;
            }
        }

        private static RectTransform CreateRect(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, Vector2 anchoredPosition, Vector2 size, Vector2? pivot = null)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            SetRect(rect, anchorMin, anchorMax, anchoredPosition, size, pivot ?? new Vector2(0.5f, 0.5f));
            return rect;
        }

        private static void SetRect(RectTransform rect, Vector2 anchorMin, Vector2 anchorMax, Vector2 anchoredPosition, Vector2 size, Vector2? pivot = null)
        {
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.pivot = pivot ?? new Vector2(0.5f, 0.5f);
            rect.anchoredPosition = anchoredPosition;
            rect.sizeDelta = size;
        }

        private static void Stretch(RectTransform rect, float padding = 0f)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = new Vector2(padding, padding);
            rect.offsetMax = new Vector2(-padding, -padding);
            rect.pivot = new Vector2(0.5f, 0.5f);
        }

        private Text CreateText(string name, Transform parent, string value, int size, TextAnchor anchor, Color color)
        {
            var textObject = new GameObject(name, typeof(RectTransform), typeof(Text));
            textObject.transform.SetParent(parent, false);
            var text = textObject.GetComponent<Text>();
            text.font = font;
            text.fontSize = size;
            text.alignment = anchor;
            text.color = color;
            text.text = value;
            text.supportRichText = true;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            return text;
        }

        private static Image CreateImage(string name, Transform parent, Sprite sprite, Color color, bool sliced)
        {
            var imageObject = new GameObject(name, typeof(RectTransform), typeof(Image));
            imageObject.transform.SetParent(parent, false);
            var image = imageObject.GetComponent<Image>();
            image.sprite = sprite;
            image.type = sliced ? Image.Type.Sliced : Image.Type.Simple;
            image.color = color;
            return image;
        }

        private static RawImage CreateRawImage(string name, Transform parent, Texture texture, Color color)
        {
            var imageObject = new GameObject(name, typeof(RectTransform), typeof(RawImage));
            imageObject.transform.SetParent(parent, false);
            var image = imageObject.GetComponent<RawImage>();
            image.texture = texture;
            image.color = color;
            return image;
        }

        private static void AddShadow(Graphic graphic, Color color, Vector2 distance)
        {
            var shadow = graphic.gameObject.AddComponent<Shadow>();
            shadow.effectColor = color;
            shadow.effectDistance = distance;
            shadow.useGraphicAlpha = true;
        }

        private readonly struct AppIconDefinition
        {
            public readonly string Name;
            public readonly string Glyph;
            public readonly Color BackColor;
            public readonly IconStyle Style;
            public readonly Color ForegroundColor;
            public readonly bool OpensAppStore;

            public AppIconDefinition(string name, string glyph, Color backColor, IconStyle style, Color? foregroundColor = null, bool opensAppStore = false)
            {
                Name = name;
                Glyph = glyph;
                BackColor = backColor;
                Style = style;
                ForegroundColor = foregroundColor ?? Color.white;
                OpensAppStore = opensAppStore;
            }
        }

        private readonly struct TicketDefinition
        {
            public readonly string Tag;
            public readonly string Title;
            public readonly string Code;
            public readonly string Note;
            public readonly Color BackPrimary;
            public readonly Color BackSecondary;
            public readonly Color CoverPrimary;
            public readonly Color CoverSecondary;

            public TicketDefinition(string tag, string title, string code, string note, Color backPrimary, Color backSecondary, Color coverPrimary, Color coverSecondary)
            {
                Tag = tag;
                Title = title;
                Code = code;
                Note = note;
                BackPrimary = backPrimary;
                BackSecondary = backSecondary;
                CoverPrimary = coverPrimary;
                CoverSecondary = coverSecondary;
            }
        }

        private enum IconStyle
        {
            Text,
            AppStore,
            Messages,
            Notes,
            Calendar,
            Camera,
            TikTok
        }
    }

    public class UnlockSliderController : MonoBehaviour, IPointerUpHandler
    {
        private Slider slider;
        private Action<float> onProgress;
        private Action onUnlocked;
        private bool unlocked;
        private bool resetting;

        public void Initialize(Slider targetSlider, Action<float> progressCallback, Action unlockCallback)
        {
            slider = targetSlider;
            onProgress = progressCallback;
            onUnlocked = unlockCallback;
            slider.onValueChanged.AddListener(HandleValueChanged);
        }

        private void Update()
        {
            if (!resetting || slider == null || unlocked)
            {
                return;
            }

            slider.value = Mathf.MoveTowards(slider.value, 0f, Time.deltaTime * 2.2f);
            if (Mathf.Approximately(slider.value, 0f))
            {
                resetting = false;
            }
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (!unlocked && slider != null && slider.value < 0.98f)
            {
                resetting = true;
            }
        }

        private void HandleValueChanged(float value)
        {
            onProgress?.Invoke(value);

            if (unlocked || value < 0.98f)
            {
                return;
            }

            unlocked = true;
            resetting = false;
            slider.value = 1f;
            onUnlocked?.Invoke();
        }
    }

    public class PagedScrollController : MonoBehaviour, IBeginDragHandler, IEndDragHandler
    {
        private ScrollRect scrollRect;
        private int pageCount;
        private Action<int> onPageChanged;
        private bool dragging;
        private float targetPosition;
        private int currentPage;

        public void Initialize(ScrollRect targetScrollRect, int totalPages, Action<int> pageChanged)
        {
            scrollRect = targetScrollRect;
            pageCount = Mathf.Max(1, totalPages);
            onPageChanged = pageChanged;
            SetPage(0, true);
        }

        private void Update()
        {
            if (dragging || scrollRect == null || pageCount <= 1)
            {
                return;
            }

            scrollRect.horizontalNormalizedPosition = Mathf.Lerp(scrollRect.horizontalNormalizedPosition, targetPosition, Time.deltaTime * 12f);
        }

        public void OnBeginDrag(PointerEventData eventData)
        {
            dragging = true;
        }

        public void OnEndDrag(PointerEventData eventData)
        {
            dragging = false;
            var nearestPage = Mathf.RoundToInt(scrollRect.horizontalNormalizedPosition * (pageCount - 1));
            SetPage(nearestPage, false);
        }

        private void SetPage(int pageIndex, bool immediate)
        {
            currentPage = Mathf.Clamp(pageIndex, 0, pageCount - 1);
            targetPosition = pageCount <= 1 ? 0f : currentPage / (float)(pageCount - 1);
            if (immediate && scrollRect != null)
            {
                scrollRect.horizontalNormalizedPosition = targetPosition;
            }

            onPageChanged?.Invoke(currentPage);
        }
    }

    public class ScratchTicketController : MonoBehaviour, IPointerDownHandler, IDragHandler
    {
        private RawImage coverImage;
        private CanvasGroup overlayGroup;
        private Action onRevealed;
        private Texture2D scratchTexture;
        private Color32[] pixels;
        private int textureWidth;
        private int textureHeight;
        private int clearedPixels;
        private bool revealed;

        public void Initialize(RawImage targetCover, CanvasGroup targetOverlay, Action revealCallback)
        {
            coverImage = targetCover;
            overlayGroup = targetOverlay;
            onRevealed = revealCallback;

            scratchTexture = GiftPhoneArt.CloneTexture((Texture2D)coverImage.texture);
            coverImage.texture = scratchTexture;
            textureWidth = scratchTexture.width;
            textureHeight = scratchTexture.height;
            pixels = scratchTexture.GetPixels32();
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            Scratch(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            Scratch(eventData);
        }

        private void Scratch(PointerEventData eventData)
        {
            if (revealed || coverImage == null || overlayGroup == null)
            {
                return;
            }

            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(coverImage.rectTransform, eventData.position, eventData.pressEventCamera, out var localPoint))
            {
                return;
            }

            var rect = coverImage.rectTransform.rect;
            var normalizedX = Mathf.InverseLerp(rect.xMin, rect.xMax, localPoint.x);
            var normalizedY = Mathf.InverseLerp(rect.yMin, rect.yMax, localPoint.y);
            var centerX = Mathf.RoundToInt(normalizedX * (textureWidth - 1));
            var centerY = Mathf.RoundToInt(normalizedY * (textureHeight - 1));

            const int brushRadius = 20;
            for (var y = -brushRadius; y <= brushRadius; y++)
            {
                for (var x = -brushRadius; x <= brushRadius; x++)
                {
                    if ((x * x) + (y * y) > brushRadius * brushRadius)
                    {
                        continue;
                    }

                    var pixelX = centerX + x;
                    var pixelY = centerY + y;
                    if (pixelX < 0 || pixelX >= textureWidth || pixelY < 0 || pixelY >= textureHeight)
                    {
                        continue;
                    }

                    var index = pixelY * textureWidth + pixelX;
                    if (pixels[index].a == 0)
                    {
                        continue;
                    }

                    pixels[index].a = 0;
                    clearedPixels++;
                }
            }

            scratchTexture.SetPixels32(pixels);
            scratchTexture.Apply(false, false);

            if (revealed || clearedPixels < textureWidth * textureHeight * 0.38f)
            {
                return;
            }

            revealed = true;
            overlayGroup.blocksRaycasts = false;
            overlayGroup.interactable = false;
            onRevealed?.Invoke();
            StartCoroutine(FadeOverlayOut());
        }

        private IEnumerator FadeOverlayOut()
        {
            var elapsed = 0f;
            const float duration = 0.24f;

            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                overlayGroup.alpha = 1f - Mathf.Clamp01(elapsed / duration);
                yield return null;
            }

            overlayGroup.alpha = 0f;
        }
    }

    internal static class GiftPhoneArt
    {
        private static Sprite whiteSprite;
        private static Sprite roundedSprite;
        private static Sprite pillSprite;
        private static Sprite circleSprite;
        private static Sprite screenMaskSprite;
        private static Sprite ringSprite;
        private static Texture2D backdropTexture;
        private static Texture2D bloomTexture;
        private static Texture2D wallpaperTexture;
        private static Texture2D glossTexture;
        private static Texture2D storeTexture;
        private static Texture2D heroTexture;
        private static Texture2D scratcherTexture;

        public static Sprite GetWhiteSprite()
        {
            if (whiteSprite == null)
            {
                whiteSprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0f, 0f, 1f, 1f), new Vector2(0.5f, 0.5f));
            }

            return whiteSprite;
        }

        public static Sprite GetRoundedSprite()
        {
            if (roundedSprite == null)
            {
                roundedSprite = CreateRoundedSprite(128, 28);
            }

            return roundedSprite;
        }

        public static Sprite GetPillSprite()
        {
            if (pillSprite == null)
            {
                pillSprite = CreateRoundedSprite(128, 60);
            }

            return pillSprite;
        }

        public static Sprite GetCircleSprite()
        {
            if (circleSprite == null)
            {
                circleSprite = CreateCircleSprite(128);
            }

            return circleSprite;
        }

        public static Sprite GetScreenMaskSprite()
        {
            if (screenMaskSprite == null)
            {
                screenMaskSprite = CreateRoundedSprite(196, 52);
            }

            return screenMaskSprite;
        }

        public static Sprite GetRingSprite()
        {
            if (ringSprite == null)
            {
                ringSprite = CreateRingSprite(128, 12f);
            }

            return ringSprite;
        }

        public static Texture2D GetBackdropTexture()
        {
            if (backdropTexture == null)
            {
                backdropTexture = CreateBackdropTexture(720, 1480);
            }

            return backdropTexture;
        }

        public static Texture2D GetBloomTexture()
        {
            if (bloomTexture == null)
            {
                bloomTexture = CreateBloomTexture(512, 1024);
            }

            return bloomTexture;
        }

        public static Texture2D GetWallpaperTexture()
        {
            if (wallpaperTexture == null)
            {
                wallpaperTexture = CreateWallpaper(640, 1280);
            }

            return wallpaperTexture;
        }

        public static Texture2D GetGlossTexture()
        {
            if (glossTexture == null)
            {
                glossTexture = CreateGlossTexture(128, 128);
            }

            return glossTexture;
        }

        public static Texture2D GetStoreTexture()
        {
            if (storeTexture == null)
            {
                storeTexture = CreateStoreTexture(640, 1280);
            }

            return storeTexture;
        }

        public static Texture2D GetHeroTexture()
        {
            if (heroTexture == null)
            {
                heroTexture = CreateHeroTexture(640, 360);
            }

            return heroTexture;
        }

        public static Texture2D GetScratcherTexture()
        {
            if (scratcherTexture == null)
            {
                scratcherTexture = CreateScratcherTexture(640, 1280);
            }

            return scratcherTexture;
        }

        public static Texture2D CreateScratchCoverTexture(int width, int height, Color a, Color b)
        {
            var texture = NewTexture(width, height, "ScratchCover");
            var pixels = new Color[width * height];

            for (var y = 0; y < height; y++)
            {
                var v = y / (float)(height - 1);
                for (var x = 0; x < width; x++)
                {
                    var u = x / (float)(width - 1);
                    var diagonal = Mathf.Sin((u + v) * 24f) * 0.5f + 0.5f;
                    var sparkle = Mathf.PerlinNoise(u * 18f, v * 18f);
                    var color = Color.Lerp(a, b, v);
                    color = Color.Lerp(color, Color.white, sparkle * 0.08f + diagonal * 0.06f);
                    pixels[y * width + x] = color;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        public static Texture2D CloneTexture(Texture2D source)
        {
            var clone = NewTexture(source.width, source.height, source.name + "_Clone");
            clone.SetPixels32(source.GetPixels32());
            clone.Apply(false, false);
            return clone;
        }

        private static Texture2D CreateBackdropTexture(int width, int height)
        {
            var texture = NewTexture(width, height, "GiftBackdrop");
            var pixels = new Color[width * height];

            var pink = new Color(0.83f, 0.39f, 0.70f);
            var violet = new Color(0.40f, 0.24f, 0.74f);
            var peach = new Color(0.98f, 0.67f, 0.54f);
            var night = new Color(0.08f, 0.06f, 0.14f);

            for (var y = 0; y < height; y++)
            {
                var v = y / (float)(height - 1);
                for (var x = 0; x < width; x++)
                {
                    var u = x / (float)(width - 1);
                    var gradient = Lerp3(night, violet, peach, v * 0.92f);
                    var glowA = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.2f, 0.18f)) * 1.7f);
                    var glowB = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.82f, 0.28f)) * 1.9f);
                    var glowC = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.48f, 0.86f)) * 1.8f);
                    var grain = Mathf.PerlinNoise(u * 4f, v * 4f);

                    var color = gradient;
                    color = Color.Lerp(color, pink, glowA * 0.42f);
                    color = Color.Lerp(color, peach, glowB * 0.28f);
                    color = Color.Lerp(color, new Color(0.34f, 0.56f, 1f), glowC * 0.18f);
                    color *= 0.92f + grain * 0.12f;
                    pixels[y * width + x] = color;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static Texture2D CreateBloomTexture(int width, int height)
        {
            var texture = NewTexture(width, height, "GiftBloom");
            var pixels = new Color[width * height];

            for (var y = 0; y < height; y++)
            {
                var v = y / (float)(height - 1);
                for (var x = 0; x < width; x++)
                {
                    var u = x / (float)(width - 1);
                    var glowA = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.28f, 0.18f)) * 2.1f);
                    var glowB = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.80f, 0.76f)) * 2.4f);
                    var alpha = glowA * 0.36f + glowB * 0.28f;
                    pixels[y * width + x] = new Color(1f, 1f, 1f, alpha);
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static Texture2D CreateWallpaper(int width, int height)
        {
            var texture = NewTexture(width, height, "GiftWallpaper");
            var pixels = new Color[width * height];

            var top = new Color(0.14f, 0.18f, 0.36f);
            var mid = new Color(0.56f, 0.21f, 0.60f);
            var bottom = new Color(0.99f, 0.53f, 0.45f);

            for (var y = 0; y < height; y++)
            {
                var v = y / (float)(height - 1);
                for (var x = 0; x < width; x++)
                {
                    var u = x / (float)(width - 1);
                    var color = Lerp3(top, mid, bottom, v);
                    var swirl = Mathf.PerlinNoise(u * 3.8f, v * 4.2f);
                    var pearl = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.72f, 0.24f)) * 2.2f);
                    var bloom = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.24f, 0.68f)) * 1.7f);

                    color = Color.Lerp(color, new Color(0.98f, 0.87f, 0.92f), pearl * 0.36f);
                    color = Color.Lerp(color, new Color(1.00f, 0.78f, 0.72f), bloom * 0.26f);
                    color *= 0.88f + swirl * 0.18f;
                    pixels[y * width + x] = color;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static Texture2D CreateStoreTexture(int width, int height)
        {
            var texture = NewTexture(width, height, "GiftStore");
            var pixels = new Color[width * height];

            var top = new Color(0.97f, 0.98f, 1f);
            var middle = new Color(1.00f, 0.96f, 0.97f);
            var bottom = new Color(0.94f, 0.95f, 1f);

            for (var y = 0; y < height; y++)
            {
                var v = y / (float)(height - 1);
                for (var x = 0; x < width; x++)
                {
                    var u = x / (float)(width - 1);
                    var baseColor = Lerp3(top, middle, bottom, v);
                    var noise = Mathf.PerlinNoise(u * 7f, v * 7f);
                    var blush = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.70f, 0.28f)) * 2.7f);
                    var mist = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.18f, 0.72f)) * 2.1f);
                    baseColor = Color.Lerp(baseColor, new Color(1.00f, 0.89f, 0.92f), blush * 0.24f);
                    baseColor = Color.Lerp(baseColor, new Color(0.88f, 0.93f, 1.00f), mist * 0.18f);
                    baseColor *= 0.98f + noise * 0.03f;
                    pixels[y * width + x] = baseColor;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static Texture2D CreateHeroTexture(int width, int height)
        {
            var texture = NewTexture(width, height, "HeroTexture");
            var pixels = new Color[width * height];

            var left = new Color(0.96f, 0.39f, 0.56f);
            var mid = new Color(0.82f, 0.36f, 0.95f);
            var right = new Color(0.31f, 0.57f, 1.00f);

            for (var y = 0; y < height; y++)
            {
                var v = y / (float)(height - 1);
                for (var x = 0; x < width; x++)
                {
                    var u = x / (float)(width - 1);
                    var color = Lerp3(left, mid, right, u);
                    var haze = Mathf.PerlinNoise(u * 8f, v * 6f);
                    var glow = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.82f, 0.26f)) * 2.1f);
                    color = Color.Lerp(color, Color.white, glow * 0.18f);
                    color *= 0.90f + haze * 0.12f;
                    pixels[y * width + x] = color;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static Texture2D CreateScratcherTexture(int width, int height)
        {
            var texture = NewTexture(width, height, "ScratcherBackground");
            var pixels = new Color[width * height];

            var top = new Color(0.28f, 0.24f, 0.66f);
            var mid = new Color(0.80f, 0.32f, 0.66f);
            var bottom = new Color(1.00f, 0.59f, 0.44f);

            for (var y = 0; y < height; y++)
            {
                var v = y / (float)(height - 1);
                for (var x = 0; x < width; x++)
                {
                    var u = x / (float)(width - 1);
                    var color = Lerp3(top, mid, bottom, v);
                    var stars = Mathf.PerlinNoise(u * 16f, v * 18f);
                    var glow = Mathf.Clamp01(1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.16f, 0.18f)) * 2.4f);
                    color = Color.Lerp(color, new Color(1.00f, 0.86f, 0.92f), glow * 0.22f);
                    color *= 0.90f + stars * 0.12f;
                    pixels[y * width + x] = color;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static Texture2D CreateGlossTexture(int width, int height)
        {
            var texture = NewTexture(width, height, "Gloss");
            var pixels = new Color[width * height];

            for (var y = 0; y < height; y++)
            {
                var v = y / (float)(height - 1);
                for (var x = 0; x < width; x++)
                {
                    var u = x / (float)(width - 1);
                    var alpha = Mathf.Clamp01(1.15f - v * 1.8f);
                    alpha *= 1f - Mathf.Abs(u - 0.5f) * 0.15f;
                    pixels[y * width + x] = new Color(1f, 1f, 1f, alpha * 0.85f);
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static Sprite CreateRoundedSprite(int size, int radius)
        {
            var texture = NewTexture(size, size, "RoundedSprite");
            var pixels = new Color[size * size];
            var center = new Vector2(size * 0.5f, size * 0.5f);
            var half = size * 0.5f;
            var innerX = half - radius;
            var innerY = half - radius;

            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var px = Mathf.Abs(x - center.x + 0.5f);
                    var py = Mathf.Abs(y - center.y + 0.5f);
                    var dx = Mathf.Max(px - innerX, 0f);
                    var dy = Mathf.Max(py - innerY, 0f);
                    var distance = Mathf.Sqrt((dx * dx) + (dy * dy));
                    var alpha = 1f - Mathf.Clamp01(distance - radius + 1f);
                    pixels[y * size + x] = new Color(1f, 1f, 1f, alpha);
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return Sprite.Create(texture, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(radius, radius, radius, radius));
        }

        private static Sprite CreateCircleSprite(int size)
        {
            var texture = NewTexture(size, size, "CircleSprite");
            var pixels = new Color[size * size];
            var center = new Vector2((size - 1) * 0.5f, (size - 1) * 0.5f);
            var radius = size * 0.5f - 1f;

            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var distance = Vector2.Distance(new Vector2(x, y), center);
                    var alpha = 1f - Mathf.Clamp01(distance - radius + 1f);
                    pixels[y * size + x] = new Color(1f, 1f, 1f, alpha);
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return Sprite.Create(texture, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f));
        }

        private static Sprite CreateRingSprite(int size, float thickness)
        {
            var texture = NewTexture(size, size, "RingSprite");
            var pixels = new Color[size * size];
            var center = new Vector2((size - 1) * 0.5f, (size - 1) * 0.5f);
            var radius = size * 0.5f - 2f;

            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var distance = Vector2.Distance(new Vector2(x, y), center);
                    var edge = Mathf.Abs(distance - radius);
                    var alpha = 1f - Mathf.Clamp01((edge - thickness) / 2f);
                    pixels[y * size + x] = new Color(1f, 1f, 1f, alpha);
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return Sprite.Create(texture, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f));
        }

        private static Texture2D NewTexture(int width, int height, string name)
        {
            return new Texture2D(width, height, TextureFormat.RGBA32, false, true)
            {
                name = name,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };
        }

        private static Color Lerp3(Color a, Color b, Color c, float t)
        {
            return t < 0.5f ? Color.Lerp(a, b, t * 2f) : Color.Lerp(b, c, (t - 0.5f) * 2f);
        }
    }
}
