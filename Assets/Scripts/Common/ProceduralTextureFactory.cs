using UnityEngine;

namespace SubnauticaClone.Common
{
    public static class ProceduralTextureFactory
    {
        public static Texture2D CreateCausticsTexture(int size, int seed = 0)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false, true)
            {
                name = "ProceduralCaustics",
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear
            };

            var state = Random.state;
            Random.InitState(seed);
            var offsetA = new Vector2(Random.value * 50f, Random.value * 50f);
            var offsetB = new Vector2(Random.value * 50f, Random.value * 50f);
            var offsetC = new Vector2(Random.value * 50f, Random.value * 50f);
            Random.state = state;

            var pixels = new Color[size * size];
            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var uv = new Vector2(x / (float)(size - 1), y / (float)(size - 1));
                    var p1 = Mathf.PerlinNoise(uv.x * 10.5f + offsetA.x, uv.y * 8.75f + offsetA.y);
                    var p2 = Mathf.PerlinNoise(uv.x * 18.2f + offsetB.x, uv.y * 15.4f + offsetB.y);
                    var p3 = Mathf.PerlinNoise(uv.x * 28.7f + offsetC.x, uv.y * 26.1f + offsetC.y);
                    var ripples = Mathf.Sin((uv.x + uv.y) * 45f + p2 * 7f) * 0.5f + 0.5f;
                    var value = Mathf.Clamp01(p1 * 0.45f + p2 * 0.35f + p3 * 0.15f + ripples * 0.25f);
                    value = Mathf.Pow(value, 4.1f);
                    pixels[y * size + x] = new Color(value, value, value, value);
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        public static Texture2D CreateRadarTexture(int size)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false, true)
            {
                name = "ProceduralRadar",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };

            var center = new Vector2((size - 1) * 0.5f, (size - 1) * 0.5f);
            var radius = size * 0.46f;
            var ringColor = new Color(0.34f, 0.95f, 1f, 0.65f);
            var gridColor = new Color(0.45f, 0.92f, 1f, 0.18f);
            var background = new Color(0.02f, 0.12f, 0.17f, 0.02f);

            var pixels = new Color[size * size];
            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var delta = new Vector2(x, y) - center;
                    var distance = delta.magnitude;
                    var normalized = distance / radius;
                    var pixel = background;

                    if (normalized <= 1f)
                    {
                        pixel = new Color(0.03f, 0.19f, 0.24f, 0.25f * (1f - normalized * 0.35f));
                        pixel += Ring(distance, radius * 0.25f, 1.3f, ringColor * 0.8f);
                        pixel += Ring(distance, radius * 0.5f, 1.3f, ringColor * 0.85f);
                        pixel += Ring(distance, radius * 0.75f, 1.3f, ringColor * 0.9f);
                        pixel += Ring(distance, radius, 1.8f, ringColor);

                        if (Mathf.Abs(delta.x) < 1.5f || Mathf.Abs(delta.y) < 1.5f)
                        {
                            pixel += gridColor;
                        }
                    }

                    pixels[y * size + x] = pixel;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        public static Texture2D CreateSoftCircleTexture(int size, Color centerColor, Color edgeColor)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false, true)
            {
                name = "SoftCircle",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };

            var center = new Vector2((size - 1) * 0.5f, (size - 1) * 0.5f);
            var radius = size * 0.5f;
            var pixels = new Color[size * size];

            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var distance = Vector2.Distance(new Vector2(x, y), center) / radius;
                    var alpha = Mathf.Clamp01(1f - distance);
                    alpha = Mathf.SmoothStep(0f, 1f, alpha);
                    pixels[y * size + x] = Color.Lerp(edgeColor, centerColor, alpha);
                }
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private static Color Ring(float distance, float radius, float width, Color color)
        {
            var intensity = 1f - Mathf.Clamp01(Mathf.Abs(distance - radius) / width);
            return color * intensity;
        }
    }
}
