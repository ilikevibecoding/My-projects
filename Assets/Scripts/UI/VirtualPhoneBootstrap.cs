using System;
using System.Collections;
using System.Collections.Generic;
using SubnauticaClone.Common;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SubnauticaClone.UI
{
    [DefaultExecutionOrder(-500)]
    public sealed class VirtualPhoneBootstrap : MonoBehaviour
    {
        private const float PhoneWidth = 430f;
        private const float PhoneHeight = 932f;
        private const float ScreenInset = 15f;
        private const float ScreenWidth = PhoneWidth - (ScreenInset * 2f);
        private const float ScreenHeight = PhoneHeight - (ScreenInset * 2f);

        private static bool hasBootstrapped;
        private static Font builtinFont;
        private static Sprite roundedSprite;
        private static Sprite wallpaperSprite;
        private static Sprite appStoreSprite;
        private static Sprite scratcherSprite;
        private static Sprite softGlowSprite;

        private readonly List<Image> pageDots = new List<Image>();

        private CanvasGroup lockScreenGroup;
        private CanvasGroup homeGroup;
        private CanvasGroup appStoreGroup;
        private CanvasGroup scratcherGroup;
        private PageSwipeView pageSwipeView;

        private Button evaGameButton;
        private Text evaGameButtonText;
        private RectTransform evaGameProgressRoot;
        private Image evaGameProgressFill;
        private Text evaGameProgressText;

        private bool isDownloading;
        private bool isTransitioning;
        private bool hasDownloadedEvaGame;

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

            BuildPhoneExperience();
        }

        private void BuildPhoneExperience()
        {
            EnsureSharedAssets();
            EnsureEventSystem();

            var canvasRoot = CreateCanvasRoot();
            BuildBackdrop(canvasRoot);
            BuildPhone(canvasRoot);
        }

        private void BuildBackdrop(RectTransform canvasRoot)
        {
            var background = CreateImage(canvasRoot, Color.white, wallpaperSprite);
            ConfigureStretch(background.rectTransform);

            var shade = CreateImage(canvasRoot, new Color(0.02f, 0.02f, 0.06f, 0.2f));
            ConfigureStretch(shade.rectTransform);

            CreateGlow(canvasRoot, new Vector2(-540f, 360f), new Vector2(820f, 820f), new Color(0.84f, 0.36f, 1f, 0.12f));
            CreateGlow(canvasRoot, new Vector2(540f, -280f), new Vector2(900f, 900f), new Color(0.18f, 0.52f, 1f, 0.12f));
            CreateGlow(canvasRoot, new Vector2(0f, 0f), new Vector2(1200f, 1200f), new Color(1f, 1f, 1f, 0.04f));
        }

        private void BuildPhone(RectTransform canvasRoot)
        {
            var shadow = CreateImage(canvasRoot, new Color(0f, 0f, 0f, 0.48f), roundedSprite);
            shadow.type = Image.Type.Sliced;
            ConfigureRect(shadow.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -14f), new Vector2(PhoneWidth + 56f, PhoneHeight + 56f));

            var frame = CreateImage(canvasRoot, new Color(0.05f, 0.06f, 0.09f, 1f), roundedSprite);
            frame.type = Image.Type.Sliced;
            ConfigureRect(frame.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(PhoneWidth, PhoneHeight));

            var sideHighlight = CreateImage(frame.transform, new Color(1f, 1f, 1f, 0.05f), roundedSprite);
            sideHighlight.type = Image.Type.Sliced;
            ConfigureStretch(sideHighlight.rectTransform, 3f);

            var bezel = CreateImage(frame.transform, new Color(0.11f, 0.12f, 0.16f, 1f), roundedSprite);
            bezel.type = Image.Type.Sliced;
            ConfigureStretch(bezel.rectTransform, 6f);

            var screenMask = new GameObject("ScreenMask", typeof(RectTransform), typeof(Image), typeof(Mask)).GetComponent<RectTransform>();
            screenMask.SetParent(frame.transform, false);
            ConfigureRect(screenMask, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(ScreenWidth, ScreenHeight));

            var screenMaskImage = screenMask.GetComponent<Image>();
            screenMaskImage.sprite = roundedSprite;
            screenMaskImage.type = Image.Type.Sliced;
            screenMaskImage.color = new Color(0.04f, 0.06f, 0.1f, 1f);

            var mask = screenMask.GetComponent<Mask>();
            mask.showMaskGraphic = true;

            var screenContent = new GameObject("ScreenContent", typeof(RectTransform)).GetComponent<RectTransform>();
            screenContent.SetParent(screenMask, false);
            ConfigureStretch(screenContent);

            BuildSharedWallpaper(screenContent);
            BuildLockScreen(screenContent);
            BuildHomeScreen(screenContent);
            BuildAppStore(screenContent);
            BuildScratcherGame(screenContent);
            BuildDynamicIsland(screenMask);
            BuildHomeIndicator(screenMask);
        }

        private void BuildSharedWallpaper(Transform parent)
        {
            var wallpaper = CreateImage(parent, Color.white, wallpaperSprite);
            ConfigureStretch(wallpaper.rectTransform);

            var topGlow = CreateImage(parent, new Color(0.78f, 0.38f, 1f, 0.13f), softGlowSprite);
            ConfigureRect(topGlow.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(-28f, 96f), new Vector2(420f, 420f));

            var bottomGlow = CreateImage(parent, new Color(0.2f, 0.72f, 1f, 0.12f), softGlowSprite);
            ConfigureRect(bottomGlow.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(46f, -32f), new Vector2(460f, 460f));

            var vignetteTop = CreateImage(parent, new Color(0f, 0f, 0f, 0.1f));
            ConfigureRect(vignetteTop.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -60f), new Vector2(ScreenWidth, 240f));

            var sparkleA = CreateImage(parent, new Color(1f, 1f, 1f, 0.12f), softGlowSprite);
            ConfigureRect(sparkleA.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(112f, 210f), new Vector2(84f, 84f));

            var sparkleB = CreateImage(parent, new Color(1f, 1f, 1f, 0.08f), softGlowSprite);
            ConfigureRect(sparkleB.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-134f, -168f), new Vector2(110f, 110f));
        }

        private void BuildLockScreen(Transform parent)
        {
            lockScreenGroup = CreateScreenGroup(parent, "LockScreen", true);

            var statusBar = new GameObject("LockStatusBar", typeof(RectTransform)).GetComponent<RectTransform>();
            statusBar.SetParent(lockScreenGroup.transform, false);
            ConfigureRect(statusBar, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -20f), new Vector2(ScreenWidth - 40f, 30f));
            CreateStatusBar(statusBar, new Color(1f, 1f, 1f, 0.92f));

            var timeText = CreateText(lockScreenGroup.transform, "Time", builtinFont, 94, FontStyle.Bold, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.98f));
            timeText.text = DateTime.Now.ToString("h:mm");
            ConfigureRect(timeText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -132f), new Vector2(320f, 108f));
            AddTextShadow(timeText, new Color(0f, 0f, 0f, 0.45f), new Vector2(0f, -3f));

            var dateText = CreateText(lockScreenGroup.transform, "Date", builtinFont, 24, FontStyle.Normal, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.78f));
            dateText.text = DateTime.Now.ToString("dddd, MMMM d");
            ConfigureRect(dateText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -204f), new Vector2(320f, 32f));

            var heroCard = CreateImage(lockScreenGroup.transform, new Color(1f, 1f, 1f, 0.12f), roundedSprite);
            heroCard.type = Image.Type.Sliced;
            ConfigureRect(heroCard.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 66f), new Vector2(338f, 150f));

            var heroGlow = CreateImage(heroCard.transform, new Color(1f, 1f, 1f, 0.08f), softGlowSprite);
            ConfigureRect(heroGlow.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(42f, -18f), new Vector2(120f, 120f));

            var heroTitle = CreateText(heroCard.transform, "HeroTitle", builtinFont, 34, FontStyle.Bold, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.98f));
            heroTitle.text = "A little surprise";
            ConfigureRect(heroTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(26f, -24f), new Vector2(260f, 42f));

            var heroBody = CreateText(heroCard.transform, "HeroBody", builtinFont, 21, FontStyle.Normal, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.84f));
            heroBody.text = "Swipe to unlock and open a tiny App Store gift made just for Eva.";
            ConfigureRect(heroBody.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(26f, -74f), new Vector2(286f, 62f));

            var swipePanel = CreateImage(lockScreenGroup.transform, new Color(1f, 1f, 1f, 0.14f), roundedSprite);
            swipePanel.type = Image.Type.Sliced;
            ConfigureRect(swipePanel.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 116f), new Vector2(344f, 68f));

            var swipeFill = CreateImage(swipePanel.transform, new Color(1f, 1f, 1f, 0.15f), roundedSprite);
            swipeFill.type = Image.Type.Sliced;
            swipeFill.rectTransform.anchorMin = new Vector2(0f, 0.5f);
            swipeFill.rectTransform.anchorMax = new Vector2(0f, 0.5f);
            swipeFill.rectTransform.pivot = new Vector2(0f, 0.5f);
            swipeFill.rectTransform.anchoredPosition = new Vector2(6f, 0f);
            swipeFill.rectTransform.sizeDelta = new Vector2(0f, 56f);

            var swipeLabel = CreateText(swipePanel.transform, "Swipe", builtinFont, 24, FontStyle.Bold, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.82f));
            swipeLabel.text = "swipe to unlock";
            ConfigureStretch(swipeLabel.rectTransform, 24f);

            var swipeHandle = CreateImage(swipePanel.transform, new Color(1f, 1f, 1f, 0.96f), roundedSprite);
            swipeHandle.type = Image.Type.Sliced;
            ConfigureRect(swipeHandle.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(34f, 0f), new Vector2(56f, 56f));

            var swipeHandleGlow = CreateImage(swipeHandle.transform, new Color(1f, 1f, 1f, 0.22f), softGlowSprite);
            ConfigureRect(swipeHandleGlow.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(90f, 90f));

            var swipeArrow = CreateText(swipeHandle.transform, "Arrow", builtinFont, 28, FontStyle.Bold, TextAnchor.MiddleCenter, new Color(0.16f, 0.18f, 0.24f, 1f));
            swipeArrow.text = ">";
            ConfigureStretch(swipeArrow.rectTransform);

            var swipeControl = swipePanel.gameObject.AddComponent<SwipeToUnlockControl>();
            swipeControl.Initialize(swipeFill.rectTransform, swipeHandle.rectTransform, swipeLabel, UnlockPhone);

            var footerHint = CreateText(lockScreenGroup.transform, "Hint", builtinFont, 18, FontStyle.Normal, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.56f));
            footerHint.text = "drag the slider all the way across";
            ConfigureRect(footerHint.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 56f), new Vector2(320f, 24f));
        }

        private void BuildHomeScreen(Transform parent)
        {
            homeGroup = CreateScreenGroup(parent, "HomeScreen", false);

            var statusBar = new GameObject("HomeStatusBar", typeof(RectTransform)).GetComponent<RectTransform>();
            statusBar.SetParent(homeGroup.transform, false);
            ConfigureRect(statusBar, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -20f), new Vector2(ScreenWidth - 40f, 30f));
            CreateStatusBar(statusBar, new Color(1f, 1f, 1f, 0.92f));

            var pageViewport = new GameObject("PageViewport", typeof(RectTransform), typeof(Image), typeof(RectMask2D)).GetComponent<RectTransform>();
            pageViewport.SetParent(homeGroup.transform, false);
            ConfigureRect(pageViewport, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -76f), new Vector2(ScreenWidth, 632f));
            pageViewport.GetComponent<Image>().color = new Color(1f, 1f, 1f, 0.001f);

            var pageTrack = new GameObject("PageTrack", typeof(RectTransform)).GetComponent<RectTransform>();
            pageTrack.SetParent(pageViewport, false);
            pageTrack.anchorMin = new Vector2(0f, 1f);
            pageTrack.anchorMax = new Vector2(0f, 1f);
            pageTrack.pivot = new Vector2(0f, 1f);
            pageTrack.anchoredPosition = Vector2.zero;
            pageTrack.sizeDelta = new Vector2(ScreenWidth * 2f, 632f);

            var pageOne = CreatePage(pageTrack, "PageOne", 0f);
            var pageTwo = CreatePage(pageTrack, "PageTwo", ScreenWidth);

            BuildHomePageOne(pageOne);
            BuildHomePageTwo(pageTwo);

            pageSwipeView = pageViewport.gameObject.AddComponent<PageSwipeView>();
            pageSwipeView.Initialize(pageTrack, ScreenWidth, 2, UpdatePageDots);

            BuildPageDots(homeGroup.transform);
            UpdatePageDots(0);

            var dock = CreateImage(homeGroup.transform, new Color(1f, 1f, 1f, 0.14f), roundedSprite);
            dock.type = Image.Type.Sliced;
            ConfigureRect(dock.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 72f), new Vector2(362f, 96f));

            CreateDockIcon(dock.rectTransform, "Phone", "P", new Color(0.35f, 0.9f, 0.48f, 1f), new Vector2(-120f, 0f), null);
            CreateDockIcon(dock.rectTransform, "Safari", "S", new Color(0.14f, 0.64f, 1f, 1f), new Vector2(-40f, 0f), null);
            CreateDockIcon(dock.rectTransform, "Photos", "O", new Color(1f, 0.48f, 0.5f, 1f), new Vector2(40f, 0f), null);
            CreateDockIcon(dock.rectTransform, "App Store", "A", new Color(0.1f, 0.48f, 1f, 1f), new Vector2(120f, 0f), OpenAppStore);
        }

        private void BuildHomePageOne(RectTransform page)
        {
            var heading = CreateText(page, "Heading", builtinFont, 30, FontStyle.Bold, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.9f));
            heading.text = "Hi Eva";
            ConfigureRect(heading.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(30f, -8f), new Vector2(180f, 40f));

            var subHeading = CreateText(page, "Sub", builtinFont, 17, FontStyle.Normal, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.62f));
            subHeading.text = "Swipe across the apps, then open the App Store.";
            ConfigureRect(subHeading.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(30f, -44f), new Vector2(300f, 22f));

            CreateHomeAppIcon(page, "Messages", "M", new Color(0.31f, 0.88f, 0.5f, 1f), new Vector2(32f, -96f), null);
            CreateHomeAppIcon(page, "Photos", "O", new Color(1f, 0.52f, 0.54f, 1f), new Vector2(126f, -96f), null);
            CreateHomeAppIcon(page, "Camera", "C", new Color(0.28f, 0.31f, 0.37f, 1f), new Vector2(220f, -96f), null);
            CreateHomeAppIcon(page, "Music", "N", new Color(1f, 0.26f, 0.5f, 1f), new Vector2(314f, -96f), null);

            CreateHomeAppIcon(page, "App Store", "A", new Color(0.08f, 0.47f, 1f, 1f), new Vector2(32f, -212f), OpenAppStore);
            CreateHomeAppIcon(page, "Maps", "G", new Color(0.17f, 0.8f, 0.98f, 1f), new Vector2(126f, -212f), null);
            CreateHomeAppIcon(page, "Notes", "N", new Color(1f, 0.85f, 0.26f, 1f), new Vector2(220f, -212f), null);
            CreateHomeAppIcon(page, "TikTok", "T", new Color(0.1f, 0.1f, 0.14f, 1f), new Vector2(314f, -212f), null);

            CreateHomeAppIcon(page, "Calendar", "7", new Color(1f, 0.35f, 0.35f, 1f), new Vector2(32f, -328f), null);
            CreateHomeAppIcon(page, "Health", "H", new Color(1f, 0.37f, 0.56f, 1f), new Vector2(126f, -328f), null);
            CreateHomeAppIcon(page, "Wallet", "W", new Color(0.18f, 0.2f, 0.25f, 1f), new Vector2(220f, -328f), null);
            CreateHomeAppIcon(page, "Clock", "K", new Color(0.16f, 0.16f, 0.18f, 1f), new Vector2(314f, -328f), null);
        }

        private void BuildHomePageTwo(RectTransform page)
        {
            var heading = CreateText(page, "Heading", builtinFont, 30, FontStyle.Bold, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.9f));
            heading.text = "More favorites";
            ConfigureRect(heading.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(30f, -8f), new Vector2(240f, 40f));

            var subHeading = CreateText(page, "Sub", builtinFont, 17, FontStyle.Normal, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.62f));
            subHeading.text = "A second page so the phone still feels like a real home screen.";
            ConfigureRect(subHeading.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(30f, -44f), new Vector2(322f, 22f));

            CreateHomeAppIcon(page, "Cooking 1", "1", new Color(1f, 0.58f, 0.26f, 1f), new Vector2(32f, -96f), null);
            CreateHomeAppIcon(page, "Cooking 2", "2", new Color(1f, 0.46f, 0.32f, 1f), new Vector2(126f, -96f), null);
            CreateHomeAppIcon(page, "Cooking 3", "3", new Color(1f, 0.34f, 0.36f, 1f), new Vector2(220f, -96f), null);
            CreateHomeAppIcon(page, "Arcade", "G", new Color(0.66f, 0.48f, 1f, 1f), new Vector2(314f, -96f), null);

            CreateHomeAppIcon(page, "Memories", "E", new Color(0.23f, 0.79f, 1f, 1f), new Vector2(32f, -212f), null);
            CreateHomeAppIcon(page, "Gifts", "V", new Color(0.95f, 0.37f, 0.78f, 1f), new Vector2(126f, -212f), null);
            CreateHomeAppIcon(page, "Playlist", "P", new Color(0.23f, 0.21f, 0.3f, 1f), new Vector2(220f, -212f), null);
            CreateHomeAppIcon(page, "Travel", "T", new Color(0.11f, 0.75f, 0.86f, 1f), new Vector2(314f, -212f), null);

            var tipCard = CreateImage(page, new Color(1f, 1f, 1f, 0.13f), roundedSprite);
            tipCard.type = Image.Type.Sliced;
            ConfigureRect(tipCard.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(28f, -394f), new Vector2(344f, 132f));

            var tipTitle = CreateText(tipCard.transform, "TipTitle", builtinFont, 28, FontStyle.Bold, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.96f));
            tipTitle.text = "Next stop";
            ConfigureRect(tipTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -20f), new Vector2(180f, 36f));

            var tipBody = CreateText(tipCard.transform, "TipBody", builtinFont, 21, FontStyle.Normal, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.8f));
            tipBody.text = "Go back one page and tap the App Store to find Eva's game.";
            ConfigureRect(tipBody.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -62f), new Vector2(300f, 56f));
        }

        private void BuildPageDots(Transform parent)
        {
            pageDots.Clear();

            var dotsRoot = new GameObject("PageDots", typeof(RectTransform)).GetComponent<RectTransform>();
            dotsRoot.SetParent(parent, false);
            ConfigureRect(dotsRoot, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 156f), new Vector2(72f, 16f));

            for (var i = 0; i < 2; i++)
            {
                var dot = CreateImage(dotsRoot, new Color(1f, 1f, 1f, 0.28f), roundedSprite);
                dot.type = Image.Type.Sliced;
                ConfigureRect(dot.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(i == 0 ? -12f : 12f, 0f), new Vector2(8f, 8f));
                pageDots.Add(dot);
            }
        }

        private void BuildAppStore(Transform parent)
        {
            appStoreGroup = CreateScreenGroup(parent, "AppStoreScreen", false);

            var background = CreateImage(appStoreGroup.transform, Color.white, appStoreSprite);
            ConfigureStretch(background.rectTransform);

            var statusBar = new GameObject("StoreStatusBar", typeof(RectTransform)).GetComponent<RectTransform>();
            statusBar.SetParent(appStoreGroup.transform, false);
            ConfigureRect(statusBar, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -20f), new Vector2(ScreenWidth - 40f, 30f));
            CreateStatusBar(statusBar, new Color(0.08f, 0.09f, 0.14f, 0.96f));

            var backButton = CreateTextButton(appStoreGroup.transform, "< Home", new Vector2(-146f, -62f), new Vector2(96f, 30f), 20, new Color(0.06f, 0.39f, 0.98f, 1f), ShowHomeScreen);
            backButton.alignment = TextAnchor.MiddleLeft;

            var title = CreateText(appStoreGroup.transform, "Title", builtinFont, 36, FontStyle.Bold, TextAnchor.MiddleCenter, new Color(0.08f, 0.09f, 0.14f, 1f));
            title.text = "App Store";
            ConfigureRect(title.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -60f), new Vector2(240f, 40f));

            var heroCard = CreateImage(appStoreGroup.transform, new Color(1f, 1f, 1f, 0.22f), roundedSprite);
            heroCard.type = Image.Type.Sliced;
            ConfigureRect(heroCard.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -186f), new Vector2(352f, 214f));

            var heroArt = CreateImage(heroCard.transform, new Color(1f, 1f, 1f, 1f), scratcherSprite);
            heroArt.type = Image.Type.Sliced;
            ConfigureStretch(heroArt.rectTransform, 0f);

            var heroTopLabel = CreateText(heroCard.transform, "Label", builtinFont, 17, FontStyle.Bold, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.78f));
            heroTopLabel.text = "PRIVATE RELEASE";
            ConfigureRect(heroTopLabel.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(24f, -24f), new Vector2(160f, 24f));

            var heroTitle = CreateText(heroCard.transform, "HeroTitle", builtinFont, 40, FontStyle.Bold, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.98f));
            heroTitle.text = "Eva's game";
            ConfigureRect(heroTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -54f), new Vector2(260f, 44f));

            var heroBody = CreateText(heroCard.transform, "HeroBody", builtinFont, 20, FontStyle.Normal, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.86f));
            heroBody.text = "A tiny one-of-one download that opens into scratch-off prizes.";
            ConfigureRect(heroBody.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(24f, -106f), new Vector2(270f, 46f));

            var heroBadge = CreateImage(heroCard.transform, new Color(1f, 1f, 1f, 0.16f), roundedSprite);
            heroBadge.type = Image.Type.Sliced;
            ConfigureRect(heroBadge.rectTransform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(74f, 32f), new Vector2(104f, 32f));

            var heroBadgeText = CreateText(heroBadge.transform, "Badge", builtinFont, 16, FontStyle.Bold, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.9f));
            heroBadgeText.text = "Gift build";
            ConfigureStretch(heroBadgeText.rectTransform);

            var featuredHeader = CreateText(appStoreGroup.transform, "FeaturedHeader", builtinFont, 24, FontStyle.Bold, TextAnchor.MiddleLeft, new Color(0.1f, 0.12f, 0.16f, 1f));
            featuredHeader.text = "Featured for Eva";
            ConfigureRect(featuredHeader.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(26f, -312f), new Vector2(220f, 32f));

            var evaRow = CreateImage(appStoreGroup.transform, new Color(1f, 1f, 1f, 0.92f), roundedSprite);
            evaRow.type = Image.Type.Sliced;
            ConfigureRect(evaRow.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -382f), new Vector2(352f, 96f));

            var evaRowButton = evaRow.gameObject.AddComponent<Button>();
            ConfigureButton(evaRowButton);
            evaRowButton.onClick.AddListener(HandleEvaGameButton);

            var evaIcon = CreateImage(evaRow.transform, new Color(0.16f, 0.48f, 1f, 1f), roundedSprite);
            evaIcon.type = Image.Type.Sliced;
            ConfigureRect(evaIcon.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(48f, 0f), new Vector2(64f, 64f));

            var evaIconGlyph = CreateText(evaIcon.transform, "Glyph", builtinFont, 30, FontStyle.Bold, TextAnchor.MiddleCenter, Color.white);
            evaIconGlyph.text = "E";
            ConfigureStretch(evaIconGlyph.rectTransform);

            var evaTitle = CreateText(evaRow.transform, "EvaTitle", builtinFont, 24, FontStyle.Bold, TextAnchor.UpperLeft, new Color(0.08f, 0.09f, 0.14f, 1f));
            evaTitle.text = "Eva's game";
            ConfigureRect(evaTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(94f, -18f), new Vector2(176f, 28f));

            var evaSubTitle = CreateText(evaRow.transform, "EvaSubTitle", builtinFont, 18, FontStyle.Normal, TextAnchor.UpperLeft, new Color(0.35f, 0.38f, 0.48f, 1f));
            evaSubTitle.text = "Private gift build";
            ConfigureRect(evaSubTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(94f, -48f), new Vector2(160f, 24f));

            evaGameButton = CreateButton(evaRow.transform, new Vector2(296f, 0f), new Vector2(92f, 40f), new Color(0.06f, 0.38f, 0.98f, 1f));
            evaGameButton.onClick.AddListener(HandleEvaGameButton);

            evaGameButtonText = CreateText(evaGameButton.transform, "ButtonText", builtinFont, 18, FontStyle.Bold, TextAnchor.MiddleCenter, Color.white);
            evaGameButtonText.text = "GET";
            ConfigureStretch(evaGameButtonText.rectTransform);

            evaGameProgressRoot = new GameObject("ProgressRoot", typeof(RectTransform)).GetComponent<RectTransform>();
            evaGameProgressRoot.SetParent(evaGameButton.transform, false);
            ConfigureStretch(evaGameProgressRoot);
            evaGameProgressRoot.gameObject.SetActive(false);

            var progressBack = CreateImage(evaGameProgressRoot, new Color(1f, 1f, 1f, 0.22f), roundedSprite);
            progressBack.type = Image.Type.Sliced;
            ConfigureRect(progressBack.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(28f, 28f));

            evaGameProgressFill = CreateImage(evaGameProgressRoot, new Color(1f, 1f, 1f, 0.95f), roundedSprite);
            evaGameProgressFill.type = Image.Type.Filled;
            evaGameProgressFill.fillMethod = Image.FillMethod.Radial360;
            evaGameProgressFill.fillOrigin = 2;
            evaGameProgressFill.fillClockwise = false;
            evaGameProgressFill.fillAmount = 0f;
            ConfigureRect(evaGameProgressFill.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(28f, 28f));

            var progressCenter = CreateImage(evaGameProgressRoot, new Color(0.06f, 0.38f, 0.98f, 1f), roundedSprite);
            progressCenter.type = Image.Type.Sliced;
            ConfigureRect(progressCenter.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(18f, 18f));

            evaGameProgressText = CreateText(evaGameProgressRoot, "ProgressText", builtinFont, 12, FontStyle.Bold, TextAnchor.MiddleCenter, Color.white);
            evaGameProgressText.text = "0%";
            ConfigureStretch(evaGameProgressText.rectTransform);

            var favoritesHeader = CreateText(appStoreGroup.transform, "FavoritesHeader", builtinFont, 24, FontStyle.Bold, TextAnchor.MiddleLeft, new Color(0.1f, 0.12f, 0.16f, 1f));
            favoritesHeader.text = "Favorite games";
            ConfigureRect(favoritesHeader.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(26f, -470f), new Vector2(180f, 32f));

            CreateStoreRow(appStoreGroup.transform, "Cooking game 1", "Temporary favorite", "1", new Color(1f, 0.6f, 0.28f, 1f), new Vector2(0f, -542f));
            CreateStoreRow(appStoreGroup.transform, "Cooking game 2", "Temporary favorite", "2", new Color(1f, 0.48f, 0.35f, 1f), new Vector2(0f, -624f));
            CreateStoreRow(appStoreGroup.transform, "Cooking game 3", "Temporary favorite", "3", new Color(1f, 0.36f, 0.38f, 1f), new Vector2(0f, -706f));
            CreateStoreRow(appStoreGroup.transform, "TikTok", "Temporary favorite", "T", new Color(0.1f, 0.1f, 0.14f, 1f), new Vector2(0f, -788f));
        }

        private void BuildScratcherGame(Transform parent)
        {
            scratcherGroup = CreateScreenGroup(parent, "ScratcherScreen", false);

            var background = CreateImage(scratcherGroup.transform, Color.white, scratcherSprite);
            ConfigureStretch(background.rectTransform);

            var statusBar = new GameObject("GameStatusBar", typeof(RectTransform)).GetComponent<RectTransform>();
            statusBar.SetParent(scratcherGroup.transform, false);
            ConfigureRect(statusBar, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -20f), new Vector2(ScreenWidth - 40f, 30f));
            CreateStatusBar(statusBar, new Color(1f, 1f, 1f, 0.94f));

            var backButton = CreateTextButton(scratcherGroup.transform, "< Store", new Vector2(-144f, -62f), new Vector2(96f, 30f), 20, new Color(0.75f, 0.88f, 1f, 1f), OpenAppStore);
            backButton.alignment = TextAnchor.MiddleLeft;

            var title = CreateText(scratcherGroup.transform, "Title", builtinFont, 40, FontStyle.Bold, TextAnchor.MiddleCenter, Color.white);
            title.text = "Eva Scratchers";
            ConfigureRect(title.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -112f), new Vector2(320f, 42f));

            var subtitle = CreateText(scratcherGroup.transform, "Subtitle", builtinFont, 20, FontStyle.Normal, TextAnchor.MiddleCenter, new Color(1f, 1f, 1f, 0.82f));
            subtitle.text = "Scratch each ticket to reveal one Amazon surprise code.";
            ConfigureRect(subtitle.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -152f), new Vector2(340f, 48f));

            CreateScratchTicket(scratcherGroup.transform, "Cozy Candle Haul", "AMAZON CANDLE SET", "CODE: EVA-CANDLE-07", new Vector2(0f, -286f), new Color(1f, 0.49f, 0.39f, 1f), new Color(1f, 0.7f, 0.42f, 1f), 1);
            CreateScratchTicket(scratcherGroup.transform, "Self-Care Restock", "AMAZON SKINCARE KIT", "CODE: EVA-GLOW-12", new Vector2(0f, -472f), new Color(0.33f, 0.77f, 1f, 1f), new Color(0.59f, 0.53f, 1f, 1f), 2);
            CreateScratchTicket(scratcherGroup.transform, "Cute Kitchen Drop", "AMAZON BAKING SET", "CODE: EVA-BAKE-21", new Vector2(0f, -658f), new Color(0.97f, 0.35f, 0.71f, 1f), new Color(0.58f, 0.31f, 1f, 1f), 3);
        }

        private void BuildDynamicIsland(Transform parent)
        {
            var island = CreateImage(parent, new Color(0.02f, 0.03f, 0.05f, 1f), roundedSprite);
            island.type = Image.Type.Sliced;
            ConfigureRect(island.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -18f), new Vector2(128f, 34f));

            var lens = CreateImage(island.transform, new Color(0.16f, 0.17f, 0.21f, 1f), roundedSprite);
            lens.type = Image.Type.Sliced;
            ConfigureRect(lens.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-18f, 0f), new Vector2(18f, 18f));

            var speaker = CreateImage(island.transform, new Color(0.11f, 0.12f, 0.15f, 1f), roundedSprite);
            speaker.type = Image.Type.Sliced;
            ConfigureRect(speaker.rectTransform, new Vector2(0f, 0.5f), new Vector2(1f, 0.5f), new Vector2(0f, 0f), new Vector2(-44f, 10f));
        }

        private void BuildHomeIndicator(Transform parent)
        {
            var indicator = CreateButton(parent, new Vector2(0f, 0f), new Vector2(150f, 24f), new Color(1f, 1f, 1f, 0f));
            ConfigureRect(indicator.GetComponent<RectTransform>(), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 16f), new Vector2(150f, 24f));
            indicator.onClick.AddListener(ShowHomeScreen);

            var line = CreateImage(indicator.transform, new Color(1f, 1f, 1f, 0.78f), roundedSprite);
            line.type = Image.Type.Sliced;
            ConfigureRect(line.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(136f, 6f));
        }

        private void UnlockPhone()
        {
            if (isTransitioning)
            {
                return;
            }

            StartCoroutine(TransitionTo(lockScreenGroup, homeGroup));
        }

        private void ShowHomeScreen()
        {
            if (isTransitioning)
            {
                return;
            }

            if (scratcherGroup.gameObject.activeSelf)
            {
                StartCoroutine(TransitionTo(scratcherGroup, homeGroup));
                return;
            }

            if (appStoreGroup.gameObject.activeSelf)
            {
                StartCoroutine(TransitionTo(appStoreGroup, homeGroup));
            }
        }

        private void OpenAppStore()
        {
            if (isTransitioning)
            {
                return;
            }

            if (scratcherGroup.gameObject.activeSelf)
            {
                StartCoroutine(TransitionTo(scratcherGroup, appStoreGroup));
                return;
            }

            if (homeGroup.gameObject.activeSelf)
            {
                StartCoroutine(TransitionTo(homeGroup, appStoreGroup));
            }
            else
            {
                SetGroupVisible(appStoreGroup, true);
            }
        }

        private void OpenScratcherGame()
        {
            if (isTransitioning)
            {
                return;
            }

            StartCoroutine(TransitionTo(appStoreGroup, scratcherGroup));
        }

        private void HandleEvaGameButton()
        {
            if (hasDownloadedEvaGame)
            {
                OpenScratcherGame();
                return;
            }

            if (isDownloading)
            {
                return;
            }

            StartCoroutine(DownloadEvaGameRoutine());
        }

        private IEnumerator DownloadEvaGameRoutine()
        {
            isDownloading = true;
            evaGameButton.interactable = false;
            evaGameButtonText.gameObject.SetActive(false);
            evaGameProgressRoot.gameObject.SetActive(true);

            const float duration = 1.9f;
            var elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                var t = Mathf.Clamp01(elapsed / duration);
                var eased = Mathf.SmoothStep(0f, 1f, t);

                evaGameProgressFill.fillAmount = eased;
                evaGameProgressText.text = $"{Mathf.RoundToInt(eased * 100f)}%";

                yield return null;
            }

            hasDownloadedEvaGame = true;
            isDownloading = false;

            evaGameProgressRoot.gameObject.SetActive(false);
            evaGameButtonText.gameObject.SetActive(true);
            evaGameButtonText.text = "OPEN";
            evaGameButton.interactable = true;

            yield return new WaitForSecondsRealtime(0.35f);
            OpenScratcherGame();
        }

        private IEnumerator TransitionTo(CanvasGroup fromGroup, CanvasGroup toGroup)
        {
            isTransitioning = true;

            SetGroupVisible(toGroup, true);
            toGroup.alpha = 0f;

            var fromRect = fromGroup.transform as RectTransform;
            var toRect = toGroup.transform as RectTransform;
            if (fromRect != null)
            {
                fromRect.anchoredPosition = Vector2.zero;
            }

            if (toRect != null)
            {
                toRect.anchoredPosition = new Vector2(24f, 0f);
            }

            const float duration = 0.28f;
            var elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                var t = Mathf.Clamp01(elapsed / duration);
                var eased = 1f - Mathf.Pow(1f - t, 3f);

                fromGroup.alpha = 1f - eased;
                toGroup.alpha = eased;

                if (fromRect != null)
                {
                    fromRect.anchoredPosition = new Vector2(-12f * eased, 0f);
                }

                if (toRect != null)
                {
                    toRect.anchoredPosition = new Vector2(24f * (1f - eased), 0f);
                }

                yield return null;
            }

            if (fromRect != null)
            {
                fromRect.anchoredPosition = Vector2.zero;
            }

            if (toRect != null)
            {
                toRect.anchoredPosition = Vector2.zero;
            }

            SetGroupVisible(fromGroup, false);
            SetGroupVisible(toGroup, true);
            toGroup.alpha = 1f;

            isTransitioning = false;
        }

        private void UpdatePageDots(int pageIndex)
        {
            for (var i = 0; i < pageDots.Count; i++)
            {
                var isActive = i == pageIndex;
                pageDots[i].color = isActive
                    ? new Color(1f, 1f, 1f, 0.96f)
                    : new Color(1f, 1f, 1f, 0.28f);

                pageDots[i].rectTransform.sizeDelta = isActive ? new Vector2(18f, 8f) : new Vector2(8f, 8f);
            }
        }

        private RectTransform CreatePage(Transform parent, string name, float xOffset)
        {
            var page = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            page.SetParent(parent, false);
            page.anchorMin = new Vector2(0f, 1f);
            page.anchorMax = new Vector2(0f, 1f);
            page.pivot = new Vector2(0f, 1f);
            page.anchoredPosition = new Vector2(xOffset, 0f);
            page.sizeDelta = new Vector2(ScreenWidth, 632f);
            return page;
        }

        private void CreateHomeAppIcon(RectTransform parent, string title, string glyph, Color color, Vector2 anchoredPosition, Action callback)
        {
            var buttonRoot = new GameObject($"{title} Icon", typeof(RectTransform)).GetComponent<RectTransform>();
            buttonRoot.SetParent(parent, false);
            buttonRoot.anchorMin = new Vector2(0f, 1f);
            buttonRoot.anchorMax = new Vector2(0f, 1f);
            buttonRoot.pivot = new Vector2(0f, 1f);
            buttonRoot.anchoredPosition = anchoredPosition;
            buttonRoot.sizeDelta = new Vector2(82f, 102f);

            var iconButton = CreateButton(buttonRoot, new Vector2(39f, -39f), new Vector2(78f, 78f), color);
            if (callback != null)
            {
                iconButton.onClick.AddListener(() => callback());
            }
            else
            {
                iconButton.interactable = false;
            }

            var iconBackground = iconButton.GetComponent<Image>();
            iconBackground.sprite = roundedSprite;
            iconBackground.type = Image.Type.Sliced;

            var gloss = CreateImage(iconButton.transform, new Color(1f, 1f, 1f, 0.16f), softGlowSprite);
            ConfigureRect(gloss.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -16f), new Vector2(42f, 42f));

            var glyphText = CreateText(iconButton.transform, "Glyph", builtinFont, 30, FontStyle.Bold, TextAnchor.MiddleCenter, Color.white);
            glyphText.text = glyph;
            ConfigureStretch(glyphText.rectTransform);

            var titleText = CreateText(buttonRoot, "Title", builtinFont, 15, FontStyle.Normal, TextAnchor.UpperCenter, Color.white);
            titleText.text = title;
            ConfigureRect(titleText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -84f), new Vector2(84f, 18f));
        }

        private void CreateDockIcon(RectTransform parent, string title, string glyph, Color color, Vector2 anchoredPosition, Action callback)
        {
            var iconButton = CreateButton(parent, anchoredPosition, new Vector2(66f, 66f), color);
            if (callback != null)
            {
                iconButton.onClick.AddListener(() => callback());
            }
            else
            {
                iconButton.interactable = false;
            }

            var iconBackground = iconButton.GetComponent<Image>();
            iconBackground.sprite = roundedSprite;
            iconBackground.type = Image.Type.Sliced;

            var glyphText = CreateText(iconButton.transform, "Glyph", builtinFont, 28, FontStyle.Bold, TextAnchor.MiddleCenter, Color.white);
            glyphText.text = glyph;
            ConfigureStretch(glyphText.rectTransform);
        }

        private void CreateStoreRow(Transform parent, string title, string subtitle, string glyph, Color color, Vector2 anchoredPosition)
        {
            var row = CreateImage(parent, new Color(1f, 1f, 1f, 0.88f), roundedSprite);
            row.type = Image.Type.Sliced;
            ConfigureRect(row.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), anchoredPosition, new Vector2(352f, 72f));

            var icon = CreateImage(row.transform, color, roundedSprite);
            icon.type = Image.Type.Sliced;
            ConfigureRect(icon.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(40f, 0f), new Vector2(50f, 50f));

            var iconGlyph = CreateText(icon.transform, "Glyph", builtinFont, 24, FontStyle.Bold, TextAnchor.MiddleCenter, Color.white);
            iconGlyph.text = glyph;
            ConfigureStretch(iconGlyph.rectTransform);

            var rowTitle = CreateText(row.transform, "Title", builtinFont, 20, FontStyle.Bold, TextAnchor.UpperLeft, new Color(0.08f, 0.09f, 0.14f, 1f));
            rowTitle.text = title;
            ConfigureRect(rowTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(78f, -14f), new Vector2(170f, 24f));

            var rowSubTitle = CreateText(row.transform, "Subtitle", builtinFont, 16, FontStyle.Normal, TextAnchor.UpperLeft, new Color(0.36f, 0.38f, 0.48f, 1f));
            rowSubTitle.text = subtitle;
            ConfigureRect(rowSubTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(78f, -40f), new Vector2(170f, 20f));

            var pill = CreateImage(row.transform, new Color(0.88f, 0.93f, 1f, 1f), roundedSprite);
            pill.type = Image.Type.Sliced;
            ConfigureRect(pill.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-44f, 0f), new Vector2(72f, 30f));

            var pillText = CreateText(pill.transform, "Open", builtinFont, 15, FontStyle.Bold, TextAnchor.MiddleCenter, new Color(0.06f, 0.39f, 0.98f, 1f));
            pillText.text = "OPEN";
            ConfigureStretch(pillText.rectTransform);
        }

        private void CreateScratchTicket(Transform parent, string title, string prizeLabel, string code, Vector2 anchoredPosition, Color accentA, Color accentB, int ticketIndex)
        {
            var ticket = CreateImage(parent, accentA, roundedSprite);
            ticket.type = Image.Type.Sliced;
            ConfigureRect(ticket.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), anchoredPosition, new Vector2(352f, 160f));

            var accentLayer = CreateImage(ticket.transform, accentB, softGlowSprite);
            ConfigureRect(accentLayer.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-12f, 0f), new Vector2(180f, 180f));

            var ticketLabel = CreateText(ticket.transform, "TicketLabel", builtinFont, 15, FontStyle.Bold, TextAnchor.UpperLeft, new Color(1f, 1f, 1f, 0.76f));
            ticketLabel.text = $"TICKET 0{ticketIndex}";
            ConfigureRect(ticketLabel.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(20f, -14f), new Vector2(120f, 20f));

            var ticketTitle = CreateText(ticket.transform, "TicketTitle", builtinFont, 26, FontStyle.Bold, TextAnchor.UpperLeft, Color.white);
            ticketTitle.text = title;
            ConfigureRect(ticketTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(18f, -38f), new Vector2(220f, 32f));

            var rewardPanel = CreateImage(ticket.transform, new Color(1f, 1f, 1f, 0.96f), roundedSprite);
            rewardPanel.type = Image.Type.Sliced;
            ConfigureRect(rewardPanel.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 18f), new Vector2(314f, 86f));

            var rewardTitle = CreateText(rewardPanel.transform, "RewardTitle", builtinFont, 17, FontStyle.Bold, TextAnchor.UpperLeft, new Color(0.31f, 0.34f, 0.42f, 1f));
            rewardTitle.text = prizeLabel;
            ConfigureRect(rewardTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(18f, -12f), new Vector2(220f, 20f));

            var rewardCode = CreateText(rewardPanel.transform, "RewardCode", builtinFont, 26, FontStyle.Bold, TextAnchor.MiddleCenter, new Color(0.12f, 0.13f, 0.18f, 1f));
            rewardCode.text = code;
            ConfigureRect(rewardCode.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -8f), new Vector2(260f, 36f));

            var scratchHint = CreateText(ticket.transform, "ScratchHint", builtinFont, 17, FontStyle.Bold, TextAnchor.MiddleRight, new Color(1f, 1f, 1f, 0.85f));
            scratchHint.text = "Scratch to reveal";
            ConfigureRect(scratchHint.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-18f, -16f), new Vector2(142f, 22f));

            var scratchOverlay = new GameObject("ScratchOverlay", typeof(RectTransform), typeof(RawImage)).GetComponent<RectTransform>();
            scratchOverlay.SetParent(rewardPanel.transform, false);
            ConfigureStretch(scratchOverlay);

            var scratchView = scratchOverlay.gameObject.AddComponent<ScratchCardView>();
            scratchView.Initialize(scratchOverlay.GetComponent<RawImage>(), scratchHint);
        }

        private CanvasGroup CreateScreenGroup(Transform parent, string name, bool active)
        {
            var rect = new GameObject(name, typeof(RectTransform), typeof(CanvasGroup)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            ConfigureStretch(rect);

            var group = rect.GetComponent<CanvasGroup>();
            group.alpha = active ? 1f : 0f;
            group.interactable = active;
            group.blocksRaycasts = active;
            rect.gameObject.SetActive(active);
            return group;
        }

        private static void SetGroupVisible(CanvasGroup group, bool visible)
        {
            group.gameObject.SetActive(visible);
            group.alpha = visible ? 1f : 0f;
            group.interactable = visible;
            group.blocksRaycasts = visible;
        }

        private static RectTransform CreateCanvasRoot()
        {
            var canvasObject = new GameObject("VirtualPhoneCanvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var rect = canvasObject.GetComponent<RectTransform>();

            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;

            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            return rect;
        }

        private static void EnsureEventSystem()
        {
            if (FindFirstObjectByType<EventSystem>() != null)
            {
                return;
            }

            var eventSystem = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            DontDestroyOnLoad(eventSystem);
        }

        private static void EnsureSharedAssets()
        {
            if (builtinFont == null)
            {
                builtinFont = Resources.GetBuiltinResource<Font>("Arial.ttf");
            }

            if (roundedSprite == null)
            {
                roundedSprite = CreateRoundedSprite(128, 30f);
            }

            if (wallpaperSprite == null)
            {
                wallpaperSprite = CreateGradientSprite(64, 512, new Color(0.16f, 0.11f, 0.42f, 1f), new Color(0.04f, 0.08f, 0.18f, 1f));
            }

            if (appStoreSprite == null)
            {
                appStoreSprite = CreateGradientSprite(64, 512, new Color(0.97f, 0.98f, 1f, 1f), new Color(0.91f, 0.95f, 1f, 1f));
            }

            if (scratcherSprite == null)
            {
                scratcherSprite = CreateGradientSprite(64, 512, new Color(0.5f, 0.18f, 0.82f, 1f), new Color(0.08f, 0.12f, 0.3f, 1f));
            }

            if (softGlowSprite == null)
            {
                var texture = ProceduralTextureFactory.CreateSoftCircleTexture(256, new Color(1f, 1f, 1f, 1f), new Color(1f, 1f, 1f, 0f));
                softGlowSprite = Sprite.Create(texture, new Rect(0f, 0f, texture.width, texture.height), new Vector2(0.5f, 0.5f), 100f);
            }
        }

        private static Sprite CreateRoundedSprite(int size, float radius)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false, true)
            {
                name = "RoundedSprite",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };

            var pixels = new Color[size * size];
            var half = (size - 1) * 0.5f;
            var inner = half - radius;

            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var px = Mathf.Abs(x - half) - inner;
                    var py = Mathf.Abs(y - half) - inner;
                    var outside = new Vector2(Mathf.Max(px, 0f), Mathf.Max(py, 0f)).magnitude;
                    var inside = Mathf.Min(Mathf.Max(px, py), 0f);
                    var distance = outside + inside - radius;
                    var alpha = 1f - Mathf.Clamp01(distance + 0.5f);
                    pixels[y * size + x] = new Color(1f, 1f, 1f, alpha);
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return Sprite.Create(texture, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, Vector4.zero, new Vector4(32f, 32f, 32f, 32f));
        }

        private static Sprite CreateGradientSprite(int width, int height, Color top, Color bottom)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false, true)
            {
                name = "GradientSprite",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };

            var pixels = new Color[width * height];
            for (var y = 0; y < height; y++)
            {
                var t = y / (float)(height - 1);
                var color = Color.Lerp(bottom, top, t);
                for (var x = 0; x < width; x++)
                {
                    pixels[y * width + x] = color;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f);
        }

        private static void CreateGlow(Transform parent, Vector2 position, Vector2 size, Color color)
        {
            var glow = CreateImage(parent, color, softGlowSprite);
            ConfigureRect(glow.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), position, size);
        }

        private static void CreateStatusBar(Transform parent, Color color)
        {
            var time = CreateText(parent, "Time", builtinFont, 17, FontStyle.Bold, TextAnchor.MiddleLeft, color);
            time.text = DateTime.Now.ToString("h:mm");
            ConfigureRect(time.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(2f, 0f), new Vector2(72f, 22f));

            var network = CreateText(parent, "Network", builtinFont, 14, FontStyle.Bold, TextAnchor.MiddleRight, color);
            network.text = "LTE";
            ConfigureRect(network.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-54f, 0f), new Vector2(40f, 18f));

            var battery = CreateImage(parent, color, roundedSprite);
            battery.type = Image.Type.Sliced;
            ConfigureRect(battery.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-18f, 0f), new Vector2(28f, 14f));

            var batteryLevel = CreateImage(battery.transform, new Color(0.05f, 0.12f, 0.2f, 0.18f), roundedSprite);
            batteryLevel.type = Image.Type.Sliced;
            ConfigureRect(batteryLevel.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 0f), new Vector2(18f, 8f));
        }

        private static Text CreateTextButton(Transform parent, string label, Vector2 anchoredPosition, Vector2 size, int fontSize, Color color, Action callback)
        {
            var buttonObject = new GameObject($"{label} Button", typeof(RectTransform), typeof(Button), typeof(Text));
            buttonObject.transform.SetParent(parent, false);

            var rect = buttonObject.GetComponent<RectTransform>();
            ConfigureRect(rect, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), anchoredPosition, size);

            var button = buttonObject.GetComponent<Button>();
            ConfigureButton(button);
            button.targetGraphic = null;
            button.onClick.AddListener(() => callback());

            var text = buttonObject.GetComponent<Text>();
            text.font = builtinFont;
            text.fontSize = fontSize;
            text.fontStyle = FontStyle.Bold;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = color;
            text.text = label;
            return text;
        }

        private static Button CreateButton(Transform parent, Vector2 anchoredPosition, Vector2 size, Color color)
        {
            var buttonObject = new GameObject("Button", typeof(RectTransform), typeof(Image), typeof(Button));
            buttonObject.transform.SetParent(parent, false);

            var rect = buttonObject.GetComponent<RectTransform>();
            ConfigureRect(rect, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), anchoredPosition, size);

            var image = buttonObject.GetComponent<Image>();
            image.sprite = roundedSprite;
            image.type = Image.Type.Sliced;
            image.color = color;

            var button = buttonObject.GetComponent<Button>();
            ConfigureButton(button);
            return button;
        }

        private static void ConfigureButton(Button button)
        {
            var colors = button.colors;
            colors.normalColor = Color.white;
            colors.highlightedColor = new Color(0.92f, 0.92f, 0.92f, 1f);
            colors.pressedColor = new Color(0.82f, 0.82f, 0.82f, 1f);
            colors.disabledColor = Color.white;
            colors.fadeDuration = 0.08f;
            button.colors = colors;
        }

        private static Image CreateImage(Transform parent, Color color, Sprite sprite = null)
        {
            var imageObject = new GameObject("Image", typeof(RectTransform), typeof(Image));
            imageObject.transform.SetParent(parent, false);
            var image = imageObject.GetComponent<Image>();
            image.color = color;
            image.sprite = sprite ?? roundedSprite;
            return image;
        }

        private static Text CreateText(Transform parent, string name, Font font, int size, FontStyle style, TextAnchor anchor, Color color)
        {
            var textObject = new GameObject(name, typeof(RectTransform), typeof(Text));
            textObject.transform.SetParent(parent, false);
            var text = textObject.GetComponent<Text>();
            text.font = font;
            text.fontSize = size;
            text.fontStyle = style;
            text.alignment = anchor;
            text.supportRichText = true;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.color = color;
            text.text = name;
            return text;
        }

        private static void AddTextShadow(Text text, Color color, Vector2 distance)
        {
            var shadow = text.gameObject.AddComponent<Shadow>();
            shadow.effectColor = color;
            shadow.effectDistance = distance;
        }

        private static void ConfigureRect(RectTransform rect, Vector2 anchorMin, Vector2 anchorMax, Vector2 anchoredPosition, Vector2 size)
        {
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.anchoredPosition = anchoredPosition;
            rect.sizeDelta = size;
        }

        private static void ConfigureStretch(RectTransform rect, float padding = 0f)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = new Vector2(padding, padding);
            rect.offsetMax = new Vector2(-padding, -padding);
            rect.pivot = new Vector2(0.5f, 0.5f);
        }
    }

    internal sealed class SwipeToUnlockControl : MonoBehaviour, IPointerDownHandler, IDragHandler, IEndDragHandler
    {
        private RectTransform root;
        private RectTransform fill;
        private RectTransform handle;
        private Text label;
        private Action onCompleted;

        private float progress;
        private bool completed;
        private Coroutine resetRoutine;

        public void Initialize(RectTransform fillRect, RectTransform handleRect, Text labelText, Action onCompletedCallback)
        {
            root = transform as RectTransform;
            fill = fillRect;
            handle = handleRect;
            label = labelText;
            onCompleted = onCompletedCallback;
            UpdateVisuals();
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (resetRoutine != null)
            {
                StopCoroutine(resetRoutine);
                resetRoutine = null;
            }
        }

        public void OnDrag(PointerEventData eventData)
        {
            UpdateFromPointer(eventData);
        }

        public void OnEndDrag(PointerEventData eventData)
        {
            if (completed)
            {
                return;
            }

            resetRoutine = StartCoroutine(ResetRoutine());
        }

        private void UpdateFromPointer(PointerEventData eventData)
        {
            if (completed)
            {
                return;
            }

            Vector2 localPoint;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(root, eventData.position, eventData.pressEventCamera, out localPoint))
            {
                return;
            }

            var travel = root.rect.width - handle.sizeDelta.x - 12f;
            var startX = -travel * 0.5f;
            progress = Mathf.Clamp01((localPoint.x - startX) / travel);
            UpdateVisuals();

            if (progress >= 0.98f)
            {
                progress = 1f;
                completed = true;
                UpdateVisuals();
                onCompleted?.Invoke();
            }
        }

        private void UpdateVisuals()
        {
            var travel = root.rect.width - handle.sizeDelta.x - 12f;
            var startX = -(travel * 0.5f);
            handle.anchoredPosition = new Vector2(startX + (travel * progress), 0f);
            fill.sizeDelta = new Vector2((travel * progress) + handle.sizeDelta.x, fill.sizeDelta.y);
            label.color = Color.Lerp(new Color(1f, 1f, 1f, 0.82f), new Color(1f, 1f, 1f, 0.24f), progress);
        }

        private IEnumerator ResetRoutine()
        {
            var start = progress;
            var elapsed = 0f;

            while (elapsed < 0.18f)
            {
                elapsed += Time.unscaledDeltaTime;
                progress = Mathf.Lerp(start, 0f, elapsed / 0.18f);
                UpdateVisuals();
                yield return null;
            }

            progress = 0f;
            UpdateVisuals();
            resetRoutine = null;
        }
    }

    internal sealed class PageSwipeView : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        private RectTransform track;
        private float pageWidth;
        private int pageCount;
        private Action<int> onPageChanged;

        private float startTrackX;
        private float startPointerX;
        private Coroutine snapRoutine;

        public void Initialize(RectTransform pageTrack, float width, int totalPages, Action<int> pageChangedCallback)
        {
            track = pageTrack;
            pageWidth = width;
            pageCount = totalPages;
            onPageChanged = pageChangedCallback;
        }

        public void OnBeginDrag(PointerEventData eventData)
        {
            if (snapRoutine != null)
            {
                StopCoroutine(snapRoutine);
                snapRoutine = null;
            }

            Vector2 localPoint;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(transform as RectTransform, eventData.position, eventData.pressEventCamera, out localPoint);
            startPointerX = localPoint.x;
            startTrackX = track.anchoredPosition.x;
        }

        public void OnDrag(PointerEventData eventData)
        {
            Vector2 localPoint;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(transform as RectTransform, eventData.position, eventData.pressEventCamera, out localPoint))
            {
                return;
            }

            var delta = localPoint.x - startPointerX;
            var minX = -pageWidth * (pageCount - 1);
            var newX = Mathf.Clamp(startTrackX + delta, minX, 0f);
            track.anchoredPosition = new Vector2(newX, track.anchoredPosition.y);
        }

        public void OnEndDrag(PointerEventData eventData)
        {
            var page = Mathf.RoundToInt(-track.anchoredPosition.x / pageWidth);
            page = Mathf.Clamp(page, 0, pageCount - 1);
            snapRoutine = StartCoroutine(SnapRoutine(page));
        }

        private IEnumerator SnapRoutine(int page)
        {
            var start = track.anchoredPosition.x;
            var target = -page * pageWidth;
            var elapsed = 0f;

            while (elapsed < 0.18f)
            {
                elapsed += Time.unscaledDeltaTime;
                var t = 1f - Mathf.Pow(1f - Mathf.Clamp01(elapsed / 0.18f), 3f);
                var value = Mathf.Lerp(start, target, t);
                track.anchoredPosition = new Vector2(value, track.anchoredPosition.y);
                yield return null;
            }

            track.anchoredPosition = new Vector2(target, track.anchoredPosition.y);
            onPageChanged?.Invoke(page);
            snapRoutine = null;
        }
    }

    internal sealed class ScratchCardView : MonoBehaviour, IPointerDownHandler, IDragHandler
    {
        private const int TextureWidth = 512;
        private const int TextureHeight = 160;
        private const int BrushRadius = 22;

        private RawImage scratchLayer;
        private Text statusText;
        private Texture2D scratchTexture;
        private Color32[] pixels;
        private int clearedPixels;
        private bool isRevealed;

        public void Initialize(RawImage layer, Text hintText)
        {
            scratchLayer = layer;
            statusText = hintText;

            scratchTexture = new Texture2D(TextureWidth, TextureHeight, TextureFormat.RGBA32, false, true)
            {
                name = "ScratchOverlay",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };

            pixels = BuildScratchPixels(TextureWidth, TextureHeight);
            scratchTexture.SetPixels32(pixels);
            scratchTexture.Apply(false, false);

            scratchLayer.texture = scratchTexture;
            scratchLayer.color = Color.white;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            ScratchAt(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            ScratchAt(eventData);
        }

        private void ScratchAt(PointerEventData eventData)
        {
            Vector2 localPoint;
            var rect = transform as RectTransform;
            if (rect == null || !RectTransformUtility.ScreenPointToLocalPointInRectangle(rect, eventData.position, eventData.pressEventCamera, out localPoint))
            {
                return;
            }

            var normalizedX = Mathf.InverseLerp(rect.rect.xMin, rect.rect.xMax, localPoint.x);
            var normalizedY = Mathf.InverseLerp(rect.rect.yMin, rect.rect.yMax, localPoint.y);
            var pixelX = Mathf.RoundToInt(normalizedX * (TextureWidth - 1));
            var pixelY = Mathf.RoundToInt(normalizedY * (TextureHeight - 1));

            for (var y = -BrushRadius; y <= BrushRadius; y++)
            {
                for (var x = -BrushRadius; x <= BrushRadius; x++)
                {
                    if ((x * x) + (y * y) > BrushRadius * BrushRadius)
                    {
                        continue;
                    }

                    var sampleX = pixelX + x;
                    var sampleY = pixelY + y;
                    if (sampleX < 0 || sampleX >= TextureWidth || sampleY < 0 || sampleY >= TextureHeight)
                    {
                        continue;
                    }

                    var index = sampleY * TextureWidth + sampleX;
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

            var revealed = clearedPixels / (float)pixels.Length;
            if (!isRevealed && revealed >= 0.42f)
            {
                isRevealed = true;
                statusText.text = "Prize unlocked";
                statusText.color = new Color(1f, 1f, 1f, 0.96f);
            }
        }

        private static Color32[] BuildScratchPixels(int width, int height)
        {
            var values = new Color32[width * height];
            for (var y = 0; y < height; y++)
            {
                for (var x = 0; x < width; x++)
                {
                    var index = y * width + x;
                    var noise = Mathf.PerlinNoise(x * 0.08f, y * 0.08f);
                    var stripe = Mathf.Sin((x + y) * 0.14f) * 0.5f + 0.5f;
                    var value = Mathf.Lerp(176f, 228f, noise * 0.65f + stripe * 0.35f);
                    var alpha = (byte)Mathf.RoundToInt(Mathf.Lerp(230f, 255f, noise));
                    values[index] = new Color32((byte)value, (byte)value, (byte)(value + 8f), alpha);
                }
            }

            return values;
        }
    }
}
