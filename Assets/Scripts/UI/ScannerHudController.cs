using SubnauticaClone.Common;
using SubnauticaClone.Interaction;
using SubnauticaClone.Player;
using UnityEngine;
using UnityEngine.UI;

namespace SubnauticaClone.UI
{
    public class ScannerHudController : MonoBehaviour
    {
        private static Sprite whiteSprite;

        private ScannerToolController scannerTool;
        private ScanProgressTracker tracker;

        private Text objectiveText;
        private Text statusText;
        private Text targetText;
        private Image progressFill;
        private RectTransform progressRoot;
        private Image reticle;

        public void Initialize(ScannerToolController tool, ScanProgressTracker progressTracker)
        {
            scannerTool = tool;
            tracker = progressTracker;
            BuildCanvas();
        }

        private void Update()
        {
            if (objectiveText == null || scannerTool == null || tracker == null)
            {
                return;
            }

            objectiveText.text = tracker.GetObjectiveText();
            statusText.text = tracker.TotalTargets > 0
                ? $"DATABASE {tracker.ScannedTargets}/{tracker.TotalTargets}"
                : "DATABASE ...";

            var target = scannerTool.CurrentTarget;
            if (target != null && !target.IsScanned)
            {
                targetText.text = $"<color=#8FFAFF>{target.DisplayName}</color>\nHold E to scan";
                progressRoot.gameObject.SetActive(true);
                progressFill.fillAmount = scannerTool.ScanProgressNormalized;
                reticle.color = Color.Lerp(new Color(0.64f, 0.93f, 1f, 0.85f), target.AccentColor, 0.75f);
            }
            else if (target != null && target.IsScanned)
            {
                targetText.text = $"<color=#A5FFC9>{target.DisplayName}</color>\nScan complete";
                progressRoot.gameObject.SetActive(false);
                reticle.color = new Color(0.64f, 1f, 0.78f, 0.95f);
            }
            else
            {
                targetText.text = "Sweep the reef for flora and relic signatures";
                progressRoot.gameObject.SetActive(false);
                reticle.color = new Color(0.64f, 0.93f, 1f, 0.85f);
            }
        }

        private void BuildCanvas()
        {
            if (whiteSprite == null)
            {
                whiteSprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0f, 0f, 1f, 1f), new Vector2(0.5f, 0.5f));
            }

            var canvasObject = new GameObject("ScannerHUD", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasObject.transform.SetParent(transform, false);

            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 50;

            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            var font = Resources.GetBuiltinResource<Font>("Arial.ttf");

            BuildReticle(canvasObject.transform);
            objectiveText = CreateText(canvasObject.transform, "Objective", font, 28, TextAnchor.UpperLeft, new Color(0.86f, 0.97f, 1f, 0.95f));
            ConfigureRect(objectiveText.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(36f, -34f), new Vector2(720f, 80f));

            statusText = CreateText(canvasObject.transform, "Database", font, 22, TextAnchor.UpperRight, new Color(0.55f, 0.95f, 1f, 0.8f));
            ConfigureRect(statusText.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-42f, -36f), new Vector2(420f, 50f));

            targetText = CreateText(canvasObject.transform, "Target", font, 24, TextAnchor.MiddleCenter, new Color(0.77f, 0.97f, 1f, 0.92f));
            ConfigureRect(targetText.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -150f), new Vector2(700f, 90f));

            progressRoot = new GameObject("ScanProgress", typeof(RectTransform)).GetComponent<RectTransform>();
            progressRoot.SetParent(canvasObject.transform, false);
            ConfigureRect(progressRoot, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -205f), new Vector2(320f, 18f));

            var progressBack = CreateImage(progressRoot, new Color(0.08f, 0.16f, 0.21f, 0.65f));
            ConfigureStretch(progressBack.rectTransform);

            progressFill = CreateImage(progressRoot, new Color(0.4f, 0.97f, 1f, 0.95f));
            progressFill.type = Image.Type.Filled;
            progressFill.fillMethod = Image.FillMethod.Horizontal;
            progressFill.fillOrigin = 0;
            progressFill.fillAmount = 0f;
            ConfigureStretch(progressFill.rectTransform);

            BuildRadarPanel(canvasObject.transform, font);
            progressRoot.gameObject.SetActive(false);
        }

        private void BuildReticle(Transform parent)
        {
            var reticleRoot = new GameObject("Reticle", typeof(RectTransform)).GetComponent<RectTransform>();
            reticleRoot.SetParent(parent, false);
            ConfigureRect(reticleRoot, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 0f), new Vector2(28f, 28f));

            reticle = CreateImage(reticleRoot, new Color(0.64f, 0.93f, 1f, 0.85f));
            ConfigureRect(reticle.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(5f, 5f));

            CreateReticleLine(reticleRoot, new Vector2(0f, 10f), new Vector2(2f, 12f));
            CreateReticleLine(reticleRoot, new Vector2(0f, -10f), new Vector2(2f, 12f));
            CreateReticleLine(reticleRoot, new Vector2(10f, 0f), new Vector2(12f, 2f));
            CreateReticleLine(reticleRoot, new Vector2(-10f, 0f), new Vector2(12f, 2f));
        }

        private void BuildRadarPanel(Transform parent, Font font)
        {
            var panel = new GameObject("RadarPanel", typeof(RectTransform)).GetComponent<RectTransform>();
            panel.SetParent(parent, false);
            ConfigureRect(panel, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-160f, 170f), new Vector2(290f, 290f));

            var back = CreateImage(panel, new Color(0.03f, 0.1f, 0.15f, 0.44f));
            ConfigureStretch(back.rectTransform, 8f);

            var radarImage = new GameObject("RadarTexture", typeof(RectTransform), typeof(RawImage)).GetComponent<RawImage>();
            radarImage.transform.SetParent(panel, false);
            radarImage.texture = ProceduralTextureFactory.CreateRadarTexture(256);
            radarImage.color = new Color(0.7f, 0.97f, 1f, 0.95f);
            ConfigureStretch(radarImage.rectTransform, 18f);

            var sweepGroup = new GameObject("SweepGroup", typeof(RectTransform), typeof(CanvasGroup)).GetComponent<CanvasGroup>();
            sweepGroup.transform.SetParent(panel, false);
            var sweepRect = sweepGroup.GetComponent<RectTransform>();
            ConfigureStretch(sweepRect, 18f);

            var sweep = CreateImage(sweepRect, new Color(0.42f, 1f, 1f, 0.26f));
            ConfigureRect(sweep.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0.5f), new Vector2(0f, 50f), new Vector2(6f, 108f));
            sweep.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 32f);

            var sweepController = sweep.gameObject.AddComponent<RadarSweepController>();
            sweepController.Initialize(sweepGroup);

            var title = CreateText(panel, "SEASCAN", font, 22, TextAnchor.LowerCenter, new Color(0.75f, 0.98f, 1f, 0.9f));
            ConfigureRect(title.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 10f), new Vector2(180f, 28f));
        }

        private static void CreateReticleLine(Transform parent, Vector2 anchoredPosition, Vector2 size)
        {
            var line = CreateImage(parent, new Color(0.75f, 0.96f, 1f, 0.92f));
            ConfigureRect(line.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), anchoredPosition, size);
        }

        private static Image CreateImage(Transform parent, Color color)
        {
            var imageObject = new GameObject("Image", typeof(RectTransform), typeof(Image));
            imageObject.transform.SetParent(parent, false);
            var image = imageObject.GetComponent<Image>();
            image.sprite = whiteSprite;
            image.type = Image.Type.Sliced;
            image.color = color;
            return image;
        }

        private static Text CreateText(Transform parent, string textValue, Font font, int size, TextAnchor anchor, Color color)
        {
            var textObject = new GameObject(textValue, typeof(RectTransform), typeof(Text));
            textObject.transform.SetParent(parent, false);
            var text = textObject.GetComponent<Text>();
            text.font = font;
            text.fontSize = size;
            text.alignment = anchor;
            text.supportRichText = true;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.color = color;
            text.text = textValue;
            return text;
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
}
