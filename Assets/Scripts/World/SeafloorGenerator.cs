using UnityEngine;

namespace SubnauticaClone.World
{
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer), typeof(MeshCollider))]
    public class SeafloorGenerator : MonoBehaviour
    {
        private float reefSize = 220f;
        private int resolution = 96;
        private float waterSurfaceHeight = 7.5f;
        private Mesh mesh;

        public float ReefSize => reefSize;

        public void Initialize(float size, int meshResolution, float surfaceHeight)
        {
            reefSize = size;
            resolution = Mathf.Max(24, meshResolution);
            waterSurfaceHeight = surfaceHeight;
            Build();
        }

        public float SampleHeight(float worldX, float worldZ)
        {
            var u = Mathf.InverseLerp(-reefSize * 0.5f, reefSize * 0.5f, worldX);
            var v = Mathf.InverseLerp(-reefSize * 0.5f, reefSize * 0.5f, worldZ);

            var macro = Mathf.PerlinNoise(u * 1.3f + 13.2f, v * 1.35f + 4.7f);
            var detail = Mathf.PerlinNoise(u * 6.1f + 1.9f, v * 6.7f + 11.2f);
            var ridge = Mathf.Abs(Mathf.PerlinNoise(u * 3.2f + 8.3f, v * 3.2f + 2.4f) * 2f - 1f);
            var shelf = Mathf.SmoothStep(0f, 1f, 1f - Vector2.Distance(new Vector2(u, v), new Vector2(0.54f, 0.48f)) * 1.18f);

            var baseDepth = -23.5f;
            var height = baseDepth;
            height += (macro - 0.5f) * 11f;
            height += (detail - 0.5f) * 3.8f;
            height += ridge * 2.4f;
            height += shelf * 7.5f;
            height += Mathf.Sin(worldX * 0.065f) * 0.8f + Mathf.Cos(worldZ * 0.058f) * 0.8f;

            return Mathf.Min(height, waterSurfaceHeight - 3.5f);
        }

        private void Build()
        {
            mesh = new Mesh
            {
                name = "ProceduralSeafloor"
            };

            var vertexCount = (resolution + 1) * (resolution + 1);
            var vertices = new Vector3[vertexCount];
            var normals = new Vector3[vertexCount];
            var uvs = new Vector2[vertexCount];
            var triangles = new int[resolution * resolution * 6];

            var halfSize = reefSize * 0.5f;
            var index = 0;
            for (var z = 0; z <= resolution; z++)
            {
                for (var x = 0; x <= resolution; x++)
                {
                    var px = Mathf.Lerp(-halfSize, halfSize, x / (float)resolution);
                    var pz = Mathf.Lerp(-halfSize, halfSize, z / (float)resolution);
                    var py = SampleHeight(px, pz);

                    vertices[index] = new Vector3(px, py, pz);
                    uvs[index] = new Vector2(x / (float)resolution, z / (float)resolution);
                    normals[index] = Vector3.up;
                    index++;
                }
            }

            var triangleIndex = 0;
            for (var z = 0; z < resolution; z++)
            {
                for (var x = 0; x < resolution; x++)
                {
                    var root = z * (resolution + 1) + x;
                    triangles[triangleIndex++] = root;
                    triangles[triangleIndex++] = root + resolution + 1;
                    triangles[triangleIndex++] = root + 1;
                    triangles[triangleIndex++] = root + 1;
                    triangles[triangleIndex++] = root + resolution + 1;
                    triangles[triangleIndex++] = root + resolution + 2;
                }
            }

            mesh.vertices = vertices;
            mesh.uv = uvs;
            mesh.triangles = triangles;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();

            var filter = GetComponent<MeshFilter>();
            filter.sharedMesh = mesh;

            var collider = GetComponent<MeshCollider>();
            collider.sharedMesh = mesh;

            var renderer = GetComponent<MeshRenderer>();
            renderer.sharedMaterial = CreateSeafloorMaterial();
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            renderer.receiveShadows = true;
        }

        private static Material CreateSeafloorMaterial()
        {
            var shader = Shader.Find("SubnauticaClone/CausticsOverlay");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            var material = new Material(shader)
            {
                name = "Runtime Seafloor"
            };

            if (material.HasProperty("_BaseShallow"))
            {
                material.SetColor("_BaseShallow", new Color(0.92f, 0.85f, 0.63f, 1f));
            }

            if (material.HasProperty("_BaseDeep"))
            {
                material.SetColor("_BaseDeep", new Color(0.18f, 0.31f, 0.28f, 1f));
            }

            if (material.HasProperty("_Accent"))
            {
                material.SetColor("_Accent", new Color(0.98f, 0.75f, 0.42f, 1f));
            }

            if (material.HasProperty("_Glossiness"))
            {
                material.SetFloat("_Glossiness", 0.24f);
            }

            return material;
        }
    }
}
