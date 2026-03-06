using UnityEngine;

namespace SubnauticaClone.Rendering
{
    public class LightingRigController : MonoBehaviour
    {
        private Light sunLight;
        private float baseIntensity;
        private float surfaceHeight;

        public void Initialize(float waterLevel)
        {
            surfaceHeight = waterLevel;

            var sunObject = new GameObject("Sun Light");
            sunObject.transform.SetParent(transform, false);
            sunObject.transform.rotation = Quaternion.Euler(54f, -22f, 0f);

            sunLight = sunObject.AddComponent<Light>();
            sunLight.type = LightType.Directional;
            sunLight.color = new Color(0.72f, 0.94f, 1f);
            sunLight.intensity = 1.18f;
            sunLight.shadows = LightShadows.Soft;
            sunLight.shadowStrength = 0.65f;

            baseIntensity = sunLight.intensity;

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = 0.0175f;
            RenderSettings.fogColor = new Color(0.01f, 0.28f, 0.35f);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.11f, 0.23f, 0.31f);
            RenderSettings.ambientEquatorColor = new Color(0.06f, 0.13f, 0.17f);
            RenderSettings.ambientGroundColor = new Color(0.01f, 0.03f, 0.05f);
        }

        private void Update()
        {
            if (sunLight == null)
            {
                return;
            }

            var shimmer = Mathf.Sin(Time.time * 0.7f) * 0.08f + Mathf.Sin(Time.time * 1.43f) * 0.04f;
            sunLight.intensity = baseIntensity + shimmer;

            Shader.SetGlobalVector("_SubnauticaWaterSurface", new Vector4(0f, surfaceHeight, 0f, 0f));
            Shader.SetGlobalColor("_SubnauticaFogColor", RenderSettings.fogColor);
        }
    }
}
