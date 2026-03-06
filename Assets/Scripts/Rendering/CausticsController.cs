using SubnauticaClone.Common;
using UnityEngine;

namespace SubnauticaClone.Rendering
{
    public class CausticsController : MonoBehaviour
    {
        private Texture2D causticsTexture;
        private Vector2 offsetA;
        private Vector2 offsetB;

        public void Initialize()
        {
            causticsTexture = ProceduralTextureFactory.CreateCausticsTexture(256, 1337);
            Shader.SetGlobalTexture("_SubnauticaCausticsTex", causticsTexture);
            Shader.SetGlobalFloat("_SubnauticaCausticsIntensity", 1f);
        }

        private void Update()
        {
            offsetA += new Vector2(0.021f, 0.014f) * Time.deltaTime;
            offsetB += new Vector2(-0.012f, 0.019f) * Time.deltaTime;

            Shader.SetGlobalVector("_SubnauticaCausticsOffsetA", new Vector4(offsetA.x, offsetA.y, 0f, 0f));
            Shader.SetGlobalVector("_SubnauticaCausticsOffsetB", new Vector4(offsetB.x, offsetB.y, 0f, 0f));
            Shader.SetGlobalFloat("_SubnauticaCausticsPulse", 0.85f + Mathf.Sin(Time.time * 1.7f) * 0.15f);
        }
    }
}
