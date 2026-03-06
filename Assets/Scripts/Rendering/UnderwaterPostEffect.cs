using UnityEngine;

namespace SubnauticaClone.Rendering
{
    [RequireComponent(typeof(Camera))]
    public class UnderwaterPostEffect : MonoBehaviour
    {
        private Material material;

        public void Initialize()
        {
            CreateMaterialIfNeeded();
        }

        private void OnEnable()
        {
            CreateMaterialIfNeeded();
            var cameraComponent = GetComponent<Camera>();
            cameraComponent.depthTextureMode |= DepthTextureMode.Depth;
        }

        private void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (material == null)
            {
                Graphics.Blit(source, destination);
                return;
            }

            material.SetFloat("_DistortionStrength", 0.0035f);
            material.SetFloat("_FogStrength", 0.82f);
            material.SetColor("_NearTint", new Color(0.08f, 0.53f, 0.62f, 1f));
            material.SetColor("_FarTint", new Color(0.02f, 0.13f, 0.19f, 1f));
            Graphics.Blit(source, destination, material);
        }

        private void OnDestroy()
        {
            if (material != null)
            {
                Destroy(material);
            }
        }

        private void CreateMaterialIfNeeded()
        {
            if (material != null)
            {
                return;
            }

            var shader = Shader.Find("Hidden/SubnauticaClone/UnderwaterPost");
            if (shader == null)
            {
                return;
            }

            material = new Material(shader)
            {
                hideFlags = HideFlags.HideAndDontSave
            };
        }
    }
}
