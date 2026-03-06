using UnityEngine;

namespace SubnauticaClone.World
{
    public static class RockClusterFactory
    {
        public static GameObject CreateRockCluster(Transform parent, Vector3 position, float scale, Material material, int seed)
        {
            var state = Random.state;
            Random.InitState(seed);

            var root = new GameObject("Rock Cluster");
            root.transform.SetParent(parent, false);
            root.transform.position = position;
            root.transform.rotation = Quaternion.Euler(0f, Random.Range(0f, 360f), 0f);

            var chunkCount = Random.Range(3, 6);
            for (var i = 0; i < chunkCount; i++)
            {
                var chunk = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                chunk.name = "Rock Chunk";
                chunk.transform.SetParent(root.transform, false);
                chunk.transform.localPosition = new Vector3(
                    Random.Range(-0.8f, 0.8f),
                    Random.Range(-0.2f, 0.35f),
                    Random.Range(-0.8f, 0.8f)) * scale;
                chunk.transform.localRotation = Random.rotation;
                chunk.transform.localScale = new Vector3(
                    Random.Range(0.8f, 1.6f),
                    Random.Range(0.5f, 1.2f),
                    Random.Range(0.8f, 1.5f)) * scale;

                var renderer = chunk.GetComponent<Renderer>();
                renderer.sharedMaterial = material;
                Object.Destroy(chunk.GetComponent<Collider>());
            }

            Random.state = state;
            return root;
        }
    }
}
