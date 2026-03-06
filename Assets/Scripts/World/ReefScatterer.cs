using SubnauticaClone.Interaction;
using UnityEngine;

namespace SubnauticaClone.World
{
    public class ReefScatterer : MonoBehaviour
    {
        private SeafloorGenerator seafloor;
        private ScanProgressTracker tracker;
        private float waterSurfaceHeight;

        public void Initialize(SeafloorGenerator floor, ScanProgressTracker progressTracker, float surfaceHeight)
        {
            seafloor = floor;
            tracker = progressTracker;
            waterSurfaceHeight = surfaceHeight;
            Populate();
        }

        private void Populate()
        {
            var rocksRoot = new GameObject("RockClusters").transform;
            rocksRoot.SetParent(transform, false);
            var coralRoot = new GameObject("Corals").transform;
            coralRoot.SetParent(transform, false);
            var poiRoot = new GameObject("PointsOfInterest").transform;
            poiRoot.SetParent(transform, false);

            var rockMaterial = CreateReefMaterial(new Color(0.24f, 0.3f, 0.33f), new Color(0.18f, 0.24f, 0.26f), new Color(0.38f, 0.57f, 0.68f));
            var rockMaterialWarm = CreateReefMaterial(new Color(0.36f, 0.33f, 0.29f), new Color(0.24f, 0.22f, 0.19f), new Color(0.55f, 0.45f, 0.33f));
            var coralOrange = CreateGlowMaterial(new Color(1f, 0.55f, 0.19f), new Color(1f, 0.74f, 0.28f));
            var coralBlue = CreateGlowMaterial(new Color(0.08f, 0.72f, 0.78f), new Color(0.35f, 0.95f, 1f));
            var coralPink = CreateGlowMaterial(new Color(1f, 0.42f, 0.64f), new Color(1f, 0.68f, 0.85f));
            var coralBone = CreateGlowMaterial(new Color(0.86f, 0.81f, 0.69f), new Color(0.97f, 0.95f, 0.81f));

            var state = Random.state;
            Random.InitState(90210);

            var half = seafloor.ReefSize * 0.5f - 10f;

            for (var i = 0; i < 58; i++)
            {
                var x = Random.Range(-half, half);
                var z = Random.Range(-half, half);
                var y = seafloor.SampleHeight(x, z);
                var scale = Random.Range(1.8f, 5.2f);
                var material = i % 4 == 0 ? rockMaterialWarm : rockMaterial;
                RockClusterFactory.CreateRockCluster(rocksRoot, new Vector3(x, y + scale * 0.16f - 0.45f, z), scale, material, 1000 + i);
            }

            for (var i = 0; i < 110; i++)
            {
                var x = Random.Range(-half, half);
                var z = Random.Range(-half, half);
                var y = seafloor.SampleHeight(x, z);
                var scale = Random.Range(0.8f, 2.2f);
                var type = (CoralType)(i % 4);
                var material = i % 3 == 0 ? coralOrange : i % 3 == 1 ? coralBlue : coralPink;
                CoralFactory.CreateCoral(coralRoot, new Vector3(x, y + 0.05f, z), scale, type, coralBone, material, 2000 + i);
            }

            CreateScannableCoral(poiRoot, new Vector3(-18f, seafloor.SampleHeight(-18f, -42f), -42f), 2.3f, CoralType.Bulb, coralBlue, "Glow Bulb Coral", 1.6f);
            CreateScannableCoral(poiRoot, new Vector3(22f, seafloor.SampleHeight(22f, -6f), -6f), 2.1f, CoralType.Tube, coralOrange, "Tube Sponge Cluster", 1.8f);
            CreateAncientFragment(poiRoot, new Vector3(31f, seafloor.SampleHeight(31f, 27f) + 0.3f, 27f), coralPink);

            Random.state = state;
        }

        private void CreateScannableCoral(Transform parent, Vector3 position, float scale, CoralType type, Material glowMaterial, string targetName, float scanDuration)
        {
            var baseMaterial = CreateGlowMaterial(new Color(0.77f, 0.72f, 0.58f), new Color(0.91f, 0.88f, 0.72f));
            var root = CoralFactory.CreateCoral(parent, position, scale, type, baseMaterial, glowMaterial, Mathf.RoundToInt(position.x * 10f + position.z * 100f));
            root.name = targetName;
            var collider = root.AddComponent<SphereCollider>();
            collider.radius = scale * 0.65f;
            collider.center = new Vector3(0f, scale * 0.6f, 0f);
            var target = root.AddComponent<ScannableTarget>();
            target.Initialize(targetName, scanDuration, new Color(0.3f, 0.97f, 1f));
            tracker?.RegisterTarget(target);
        }

        private void CreateAncientFragment(Transform parent, Vector3 position, Material emissiveMaterial)
        {
            var root = new GameObject("Ancient Fragment");
            root.transform.SetParent(parent, false);
            root.transform.position = position;
            root.transform.rotation = Quaternion.Euler(0f, 35f, 0f);

            for (var i = 0; i < 3; i++)
            {
                var shard = GameObject.CreatePrimitive(PrimitiveType.Cube);
                shard.transform.SetParent(root.transform, false);
                shard.transform.localPosition = new Vector3(i * 0.42f - 0.42f, Mathf.Sin(i) * 0.08f, 0f);
                shard.transform.localRotation = Quaternion.Euler(8f * i, 17f * i, 22f * i);
                shard.transform.localScale = new Vector3(0.18f, 0.8f + i * 0.15f, 0.42f);
                shard.GetComponent<Renderer>().sharedMaterial = emissiveMaterial;
                Destroy(shard.GetComponent<Collider>());
            }

            var plinth = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            plinth.transform.SetParent(root.transform, false);
            plinth.transform.localPosition = new Vector3(0f, -0.45f, 0f);
            plinth.transform.localScale = new Vector3(0.7f, 0.25f, 0.7f);
            plinth.GetComponent<Renderer>().sharedMaterial = CreateReefMaterial(new Color(0.29f, 0.33f, 0.36f), new Color(0.18f, 0.22f, 0.25f), new Color(0.52f, 0.64f, 0.7f));
            Destroy(plinth.GetComponent<Collider>());

            var collider = root.AddComponent<BoxCollider>();
            collider.size = new Vector3(1.5f, 2f, 1.2f);
            collider.center = new Vector3(0f, 0.35f, 0f);

            var target = root.AddComponent<ScannableTarget>();
            target.Initialize("Architect Fragment", 2.1f, new Color(1f, 0.62f, 0.82f));
            tracker?.RegisterTarget(target);
        }

        private static Material CreateReefMaterial(Color shallow, Color deep, Color accent)
        {
            var shader = Shader.Find("SubnauticaClone/CausticsOverlay");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            var material = new Material(shader);
            if (material.HasProperty("_BaseShallow"))
            {
                material.SetColor("_BaseShallow", shallow);
            }

            if (material.HasProperty("_BaseDeep"))
            {
                material.SetColor("_BaseDeep", deep);
            }

            if (material.HasProperty("_Accent"))
            {
                material.SetColor("_Accent", accent);
            }

            if (material.HasProperty("_Glossiness"))
            {
                material.SetFloat("_Glossiness", 0.32f);
            }

            return material;
        }

        private Material CreateGlowMaterial(Color baseColor, Color emissionColor)
        {
            var shader = Shader.Find("SubnauticaClone/BioluminescentCoral");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            var material = new Material(shader);
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", baseColor);
            }

            if (material.HasProperty("_EmissionColor"))
            {
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", emissionColor * 1.6f);
            }

            if (material.HasProperty("_GlowColor"))
            {
                material.SetColor("_GlowColor", emissionColor);
            }

            if (material.HasProperty("_Glossiness"))
            {
                material.SetFloat("_Glossiness", 0.42f);
            }

            if (material.HasProperty("_SurfaceHeight"))
            {
                material.SetFloat("_SurfaceHeight", waterSurfaceHeight);
            }

            return material;
        }
    }
}
