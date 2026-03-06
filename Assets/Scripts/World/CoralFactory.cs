using UnityEngine;

namespace SubnauticaClone.World
{
    public enum CoralType
    {
        Branch,
        Plate,
        Tube,
        Bulb
    }

    public static class CoralFactory
    {
        public static GameObject CreateCoral(Transform parent, Vector3 position, float scale, CoralType type, Material baseMaterial, Material glowMaterial, int seed)
        {
            var state = Random.state;
            Random.InitState(seed);

            var root = new GameObject(type + " Coral");
            root.transform.SetParent(parent, false);
            root.transform.position = position;
            root.transform.rotation = Quaternion.Euler(0f, Random.Range(0f, 360f), 0f);

            switch (type)
            {
                case CoralType.Branch:
                    CreateBranchCoral(root.transform, scale, baseMaterial, glowMaterial);
                    break;
                case CoralType.Plate:
                    CreatePlateCoral(root.transform, scale, baseMaterial, glowMaterial);
                    break;
                case CoralType.Tube:
                    CreateTubeCoral(root.transform, scale, baseMaterial, glowMaterial);
                    break;
                case CoralType.Bulb:
                    CreateBulbCoral(root.transform, scale, baseMaterial, glowMaterial);
                    break;
            }

            Random.state = state;
            return root;
        }

        private static void CreateBranchCoral(Transform root, float scale, Material baseMaterial, Material glowMaterial)
        {
            var branchCount = Random.Range(4, 8);
            for (var i = 0; i < branchCount; i++)
            {
                var branch = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                branch.transform.SetParent(root, false);
                branch.transform.localScale = new Vector3(
                    Random.Range(0.08f, 0.14f),
                    Random.Range(0.35f, 0.75f),
                    Random.Range(0.08f, 0.14f)) * scale;
                branch.transform.localPosition = new Vector3(
                    Random.Range(-0.28f, 0.28f),
                    branch.transform.localScale.y * 0.85f,
                    Random.Range(-0.28f, 0.28f)) * scale;
                branch.transform.localRotation = Quaternion.Euler(Random.Range(-8f, 18f), Random.Range(0f, 360f), Random.Range(-18f, 18f));
                branch.GetComponent<Renderer>().sharedMaterial = i % 2 == 0 ? baseMaterial : glowMaterial;
                Object.Destroy(branch.GetComponent<Collider>());
            }
        }

        private static void CreatePlateCoral(Transform root, float scale, Material baseMaterial, Material glowMaterial)
        {
            var stem = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            stem.transform.SetParent(root, false);
            stem.transform.localScale = new Vector3(0.09f, 0.48f, 0.09f) * scale;
            stem.transform.localPosition = new Vector3(0f, 0.35f * scale, 0f);
            stem.GetComponent<Renderer>().sharedMaterial = baseMaterial;
            Object.Destroy(stem.GetComponent<Collider>());

            var plateCount = Random.Range(2, 4);
            for (var i = 0; i < plateCount; i++)
            {
                var plate = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                plate.transform.SetParent(root, false);
                plate.transform.localScale = new Vector3(Random.Range(0.8f, 1.3f), 0.12f, Random.Range(0.8f, 1.3f)) * scale;
                plate.transform.localPosition = new Vector3(Random.Range(-0.1f, 0.1f), (0.55f + i * 0.28f) * scale, Random.Range(-0.1f, 0.1f));
                plate.transform.localRotation = Quaternion.Euler(Random.Range(-18f, 18f), Random.Range(0f, 360f), Random.Range(-12f, 12f));
                plate.GetComponent<Renderer>().sharedMaterial = i == plateCount - 1 ? glowMaterial : baseMaterial;
                Object.Destroy(plate.GetComponent<Collider>());
            }
        }

        private static void CreateTubeCoral(Transform root, float scale, Material baseMaterial, Material glowMaterial)
        {
            var tubeCount = Random.Range(4, 9);
            for (var i = 0; i < tubeCount; i++)
            {
                var tube = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                tube.transform.SetParent(root, false);
                tube.transform.localScale = new Vector3(Random.Range(0.09f, 0.14f), Random.Range(0.35f, 0.65f), Random.Range(0.09f, 0.14f)) * scale;
                tube.transform.localPosition = new Vector3(
                    Random.Range(-0.32f, 0.32f),
                    tube.transform.localScale.y * 0.95f,
                    Random.Range(-0.32f, 0.32f)) * scale;
                tube.GetComponent<Renderer>().sharedMaterial = baseMaterial;
                Object.Destroy(tube.GetComponent<Collider>());

                var cap = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                cap.transform.SetParent(tube.transform, false);
                cap.transform.localPosition = new Vector3(0f, 0.48f, 0f);
                cap.transform.localScale = new Vector3(1.15f, 0.18f, 1.15f);
                cap.GetComponent<Renderer>().sharedMaterial = glowMaterial;
                Object.Destroy(cap.GetComponent<Collider>());
            }
        }

        private static void CreateBulbCoral(Transform root, float scale, Material baseMaterial, Material glowMaterial)
        {
            var stem = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            stem.transform.SetParent(root, false);
            stem.transform.localScale = new Vector3(0.08f, 0.5f, 0.08f) * scale;
            stem.transform.localPosition = new Vector3(0f, 0.4f * scale, 0f);
            stem.GetComponent<Renderer>().sharedMaterial = baseMaterial;
            Object.Destroy(stem.GetComponent<Collider>());

            var bulbCount = Random.Range(4, 7);
            for (var i = 0; i < bulbCount; i++)
            {
                var bulb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                bulb.transform.SetParent(root, false);
                bulb.transform.localScale = Vector3.one * Random.Range(0.26f, 0.42f) * scale;
                bulb.transform.localPosition = new Vector3(
                    Random.Range(-0.35f, 0.35f),
                    Random.Range(0.75f, 1.25f),
                    Random.Range(-0.35f, 0.35f)) * scale;
                bulb.GetComponent<Renderer>().sharedMaterial = glowMaterial;
                Object.Destroy(bulb.GetComponent<Collider>());
            }
        }
    }
}
