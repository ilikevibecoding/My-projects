using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SubnauticaClone.UI
{
    public class ScratchTicketCard : MonoBehaviour, IPointerDownHandler, IDragHandler
    {
        [SerializeField] private RawImage scratchOverlay;
        [SerializeField] private RectTransform scratchArea;
        [SerializeField] private float brushRadius = 44f;
        [SerializeField] private float revealThreshold = 0.43f;

        private Texture2D scratchTexture;
        private Color32[] pixels;
        private bool isFullyRevealed;
        private int clearedPixelCount;

        public void Initialize(RawImage overlay, RectTransform area)
        {
            scratchOverlay = overlay;
            scratchArea = area;
            BuildScratchTexture();
        }

        private void OnDestroy()
        {
            if (scratchTexture != null)
            {
                Destroy(scratchTexture);
            }
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            Scratch(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            Scratch(eventData);
        }

        private void BuildScratchTexture()
        {
            const int width = 640;
            const int height = 260;

            scratchTexture = new Texture2D(width, height, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                name = "ScratchTicketTexture"
            };

            pixels = new Color32[width * height];
            for (var y = 0; y < height; y++)
            {
                for (var x = 0; x < width; x++)
                {
                    var index = (y * width) + x;
                    var xRatio = x / (float)(width - 1);
                    var yRatio = y / (float)(height - 1);
                    var wave = Mathf.Sin((xRatio * 24f) + (yRatio * 9f));
                    var shimmer = Mathf.PerlinNoise(xRatio * 14f, yRatio * 10f);
                    var brightness = 0.74f + (wave * 0.04f) + (shimmer * 0.18f);
                    pixels[index] = new Color(brightness, brightness, brightness + 0.04f, 1f);
                }
            }

            scratchTexture.SetPixels32(pixels);
            scratchTexture.Apply(false, false);

            scratchOverlay.texture = scratchTexture;
            scratchOverlay.color = Color.white;
            scratchOverlay.raycastTarget = true;
        }

        private void Scratch(PointerEventData eventData)
        {
            if (isFullyRevealed || scratchTexture == null || scratchArea == null || scratchOverlay == null)
            {
                return;
            }

            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    scratchArea,
                    eventData.position,
                    eventData.pressEventCamera,
                    out var localPoint))
            {
                return;
            }

            var rect = scratchArea.rect;
            var normalizedX = Mathf.InverseLerp(rect.xMin, rect.xMax, localPoint.x);
            var normalizedY = Mathf.InverseLerp(rect.yMin, rect.yMax, localPoint.y);

            var centerX = Mathf.RoundToInt(normalizedX * (scratchTexture.width - 1));
            var centerY = Mathf.RoundToInt(normalizedY * (scratchTexture.height - 1));
            var radius = Mathf.RoundToInt(brushRadius * (scratchTexture.width / Mathf.Max(rect.width, 1f)));

            ClearCircle(centerX, centerY, Mathf.Max(radius, 8));
            scratchTexture.SetPixels32(pixels);
            scratchTexture.Apply(false, false);

            if (!isFullyRevealed && clearedPixelCount >= pixels.Length * revealThreshold)
            {
                RevealAll();
            }
        }

        private void ClearCircle(int centerX, int centerY, int radius)
        {
            var radiusSquared = radius * radius;
            var minX = Mathf.Max(centerX - radius, 0);
            var maxX = Mathf.Min(centerX + radius, scratchTexture.width - 1);
            var minY = Mathf.Max(centerY - radius, 0);
            var maxY = Mathf.Min(centerY + radius, scratchTexture.height - 1);

            for (var y = minY; y <= maxY; y++)
            {
                var yOffset = y - centerY;
                for (var x = minX; x <= maxX; x++)
                {
                    var xOffset = x - centerX;
                    if ((xOffset * xOffset) + (yOffset * yOffset) > radiusSquared)
                    {
                        continue;
                    }

                    var index = (y * scratchTexture.width) + x;
                    if (pixels[index].a == 0)
                    {
                        continue;
                    }

                    pixels[index].a = 0;
                    clearedPixelCount++;
                }
            }
        }

        private void RevealAll()
        {
            isFullyRevealed = true;
            for (var i = 0; i < pixels.Length; i++)
            {
                pixels[i].a = 0;
            }

            scratchTexture.SetPixels32(pixels);
            scratchTexture.Apply(false, false);
        }
    }
}
