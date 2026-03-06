using SubnauticaClone.Fauna;
using SubnauticaClone.Interaction;
using SubnauticaClone.Player;
using SubnauticaClone.Rendering;
using SubnauticaClone.UI;
using SubnauticaClone.World;
using UnityEngine;

namespace SubnauticaClone.Bootstrap
{
    [DefaultExecutionOrder(-500)]
    public class PrototypeBootstrap : MonoBehaviour
    {
        private static bool hasBootstrapped;

        private const float ReefSize = 220f;
        private const float WaterSurfaceHeight = 7.5f;

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

            BuildPrototype();
        }

        private void BuildPrototype()
        {
            var tracker = gameObject.AddComponent<ScanProgressTracker>();

            var worldRoot = new GameObject("EnvironmentRoot").transform;
            worldRoot.SetParent(transform, false);
            var faunaRoot = new GameObject("FaunaRoot").transform;
            faunaRoot.SetParent(transform, false);
            var uiRoot = new GameObject("UIRoot").transform;
            uiRoot.SetParent(transform, false);
            var lightingRoot = new GameObject("LightingRig").transform;
            lightingRoot.SetParent(transform, false);

            var lightingController = lightingRoot.gameObject.AddComponent<LightingRigController>();
            lightingController.Initialize(WaterSurfaceHeight);

            var causticsController = lightingRoot.gameObject.AddComponent<CausticsController>();
            causticsController.Initialize();

            var seafloor = worldRoot.gameObject.AddComponent<SeafloorGenerator>();
            seafloor.Initialize(ReefSize, 112, WaterSurfaceHeight);

            CreateWaterSurface(worldRoot);

            var scatterer = worldRoot.gameObject.AddComponent<ReefScatterer>();
            scatterer.Initialize(seafloor, tracker, WaterSurfaceHeight);

            var particles = worldRoot.gameObject.AddComponent<ParticleFieldController>();
            particles.Initialize(ReefSize, WaterSurfaceHeight);

            var fishSchoolController = faunaRoot.gameObject.AddComponent<FishSchoolController>();
            fishSchoolController.Initialize(seafloor);

            var largeCreature = faunaRoot.gameObject.AddComponent<LargeCreaturePatrol>();
            largeCreature.Initialize(WaterSurfaceHeight);

            var playerRoot = new GameObject("PlayerRig");
            playerRoot.transform.SetParent(transform, false);
            var playerBootstrap = playerRoot.AddComponent<PlayerBootstrap>();
            playerBootstrap.Initialize(seafloor, tracker, WaterSurfaceHeight, ReefSize);

            var hudController = uiRoot.gameObject.AddComponent<ScannerHudController>();
            hudController.Initialize(playerBootstrap.ScannerTool, tracker);
        }

        private static void CreateWaterSurface(Transform parent)
        {
            var surface = GameObject.CreatePrimitive(PrimitiveType.Plane);
            surface.name = "Water Surface";
            surface.transform.SetParent(parent, false);
            surface.transform.position = new Vector3(0f, WaterSurfaceHeight, 0f);
            surface.transform.localScale = new Vector3(28f, 1f, 28f);

            var renderer = surface.GetComponent<Renderer>();
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.sharedMaterial = CreateWaterMaterial();

            var collider = surface.GetComponent<Collider>();
            if (collider != null)
            {
                Destroy(collider);
            }
        }

        private static Material CreateWaterMaterial()
        {
            var shader = Shader.Find("SubnauticaClone/WaterSurface");
            if (shader == null)
            {
                shader = Shader.Find("Legacy Shaders/Transparent/Diffuse");
            }

            var material = new Material(shader)
            {
                name = "Runtime Water Surface"
            };

            if (material.HasProperty("_Color"))
            {
                material.SetColor("_Color", new Color(0.18f, 0.72f, 0.95f, 0.45f));
            }

            if (material.HasProperty("_ShallowColor"))
            {
                material.SetColor("_ShallowColor", new Color(0.16f, 0.9f, 0.88f, 0.45f));
            }

            if (material.HasProperty("_DeepColor"))
            {
                material.SetColor("_DeepColor", new Color(0.02f, 0.2f, 0.34f, 0.68f));
            }

            return material;
        }
    }
}
