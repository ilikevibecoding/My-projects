using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace SubnauticaClone.UI
{
    internal static class PhoneUiFactory
    {
        private static Sprite roundedSprite;
        private static Sprite circleSprite;
        private static Sprite whiteSprite;
        private static Font defaultFont;

        public static Sprite RoundedSprite => roundedSprite ??= CreateRoundedSprite(72, 72, 22);

        public static Sprite CircleSprite => circleSprite ??= CreateCircleSprite(72);

        public static Sprite WhiteSprite => whiteSprite ??= Sprite.Create(
            Texture2D.whiteTexture,
            new Rect(0f, 0f, 1f, 1f),
            new Vector2(0.5f, 0.5f),
            1f);

        public static Font DefaultFont => defaultFont ??= Resources.GetBuiltinResource<Font>("Arial.ttf");

        public static RectTransform CreateRect(Transform parent, string name)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            rect.localScale = Vector3.one;
            return rect;
        }

        public static Image CreateImage(Transform parent, string name, Color color, Sprite sprite = null, bool sliced = false)
        {
            var image = new GameObject(name, typeof(RectTransform), typeof(Image)).GetComponent<Image>();
            image.transform.SetParent(parent, false);
            image.sprite = sprite ?? WhiteSprite;
            image.type = sliced ? Image.Type.Sliced : Image.Type.Simple;
            image.color = color;
            image.raycastTarget = false;
            return image;
        }

        public static RawImage CreateRawImage(Transform parent, string name, Color color)
        {
            var rawImage = new GameObject(name, typeof(RectTransform), typeof(RawImage)).GetComponent<RawImage>();
            rawImage.transform.SetParent(parent, false);
            rawImage.color = color;
            rawImage.raycastTarget = false;
            return rawImage;
        }

        public static Text CreateText(
            Transform parent,
            string name,
            string value,
            int fontSize,
            TextAnchor anchor,
            Color color,
            FontStyle fontStyle = FontStyle.Normal)
        {
            var text = new GameObject(name, typeof(RectTransform), typeof(Text)).GetComponent<Text>();
            text.transform.SetParent(parent, false);
            text.font = DefaultFont;
            text.fontSize = fontSize;
            text.alignment = anchor;
            text.fontStyle = fontStyle;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.supportRichText = true;
            text.color = color;
            text.text = value;
            return text;
        }

        public static Button CreateButton(Transform parent, string name, Color color, string labelText, int fontSize, out Text label)
        {
            var button = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button)).GetComponent<Button>();
            button.transform.SetParent(parent, false);

            var background = button.GetComponent<Image>();
            background.sprite = RoundedSprite;
            background.type = Image.Type.Sliced;
            background.color = color;

            label = CreateText(button.transform, "Label", labelText, fontSize, TextAnchor.MiddleCenter, Color.white, FontStyle.Bold);
            Stretch(label.rectTransform, 0f);

            var colors = button.colors;
            colors.highlightedColor = Multiply(color, 1.08f);
            colors.pressedColor = Multiply(color, 0.92f);
            colors.selectedColor = colors.highlightedColor;
            colors.disabledColor = new Color(color.r, color.g, color.b, color.a * 0.55f);
            button.colors = colors;
            return button;
        }

        public static Button CreateGhostButton(Transform parent, string name, string labelText, int fontSize, Color textColor, out Text label)
        {
            var button = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button)).GetComponent<Button>();
            button.transform.SetParent(parent, false);

            var background = button.GetComponent<Image>();
            background.sprite = RoundedSprite;
            background.type = Image.Type.Sliced;
            background.color = new Color(1f, 1f, 1f, 0.1f);

            label = CreateText(button.transform, "Label", labelText, fontSize, TextAnchor.MiddleCenter, textColor, FontStyle.Bold);
            Stretch(label.rectTransform, 0f);

            var colors = button.colors;
            colors.highlightedColor = new Color(1f, 1f, 1f, 0.16f);
            colors.pressedColor = new Color(1f, 1f, 1f, 0.08f);
            button.colors = colors;
            return button;
        }

        public static void SetRect(RectTransform rect, Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot, Vector2 size, Vector2 anchoredPosition)
        {
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.pivot = pivot;
            rect.sizeDelta = size;
            rect.anchoredPosition = anchoredPosition;
        }

        public static void Stretch(RectTransform rect, float padding)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = new Vector2(padding, padding);
            rect.offsetMax = new Vector2(-padding, -padding);
            rect.pivot = new Vector2(0.5f, 0.5f);
        }

        public static void AddSoftShadow(GameObject target, Color color, Vector2 distance)
        {
            var shadow = target.AddComponent<Shadow>();
            shadow.effectColor = color;
            shadow.effectDistance = distance;
            shadow.useGraphicAlpha = true;
        }

        public static void AddOutline(GameObject target, Color color, Vector2 distance)
        {
            var outline = target.AddComponent<Outline>();
            outline.effectColor = color;
            outline.effectDistance = distance;
            outline.useGraphicAlpha = true;
        }

        public static void Hook(Button button, UnityAction action)
        {
            button.onClick.RemoveAllListeners();
            button.onClick.AddListener(action);
        }

        public static void SetCanvasGroup(CanvasGroup group, bool visible)
        {
            group.alpha = visible ? 1f : 0f;
            group.interactable = visible;
            group.blocksRaycasts = visible;
            group.gameObject.SetActive(visible);
        }

        private static Color Multiply(Color color, float multiplier)
        {
            return new Color(
                Mathf.Clamp01(color.r * multiplier),
                Mathf.Clamp01(color.g * multiplier),
                Mathf.Clamp01(color.b * multiplier),
                color.a);
        }

        private static Sprite CreateRoundedSprite(int width, int height, int radius)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                name = "RoundedRectSprite"
            };

            var pixels = new Color32[width * height];
            var center = new Vector2(width * 0.5f, height * 0.5f);

            for (var y = 0; y < height; y++)
            {
                for (var x = 0; x < width; x++)
                {
                    var dx = Mathf.Abs(x + 0.5f - center.x) - (width * 0.5f - radius);
                    var dy = Mathf.Abs(y + 0.5f - center.y) - (height * 0.5f - radius);
                    var outside = new Vector2(Mathf.Max(dx, 0f), Mathf.Max(dy, 0f));
                    var distance = outside.magnitude - radius;
                    var alpha = Mathf.Clamp01(1f - Mathf.Max(distance, 0f));
                    pixels[(y * width) + x] = new Color(1f, 1f, 1f, alpha);
                }
            }

            texture.SetPixels32(pixels);
            texture.Apply(false, true);
            return Sprite.Create(
                texture,
                new Rect(0f, 0f, width, height),
                new Vector2(0.5f, 0.5f),
                100f,
                0u,
                SpriteMeshType.FullRect,
                new Vector4(radius, radius, radius, radius));
        }

        private static Sprite CreateCircleSprite(int size)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                name = "CircleSprite"
            };

            var pixels = new Color32[size * size];
            var radius = (size * 0.5f) - 1f;
            var center = new Vector2(radius, radius);

            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var distance = Vector2.Distance(new Vector2(x, y), center);
                    var alpha = Mathf.Clamp01(radius - distance);
                    pixels[(y * size) + x] = new Color(1f, 1f, 1f, alpha);
                }
            }

            texture.SetPixels32(pixels);
            texture.Apply(false, true);
            return Sprite.Create(texture, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f), 100f);
        }
    }
}
