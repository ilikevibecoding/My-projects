using System.Collections.Generic;
using SubnauticaClone.World;
using UnityEngine;

namespace SubnauticaClone.Fauna
{
    public class FishSchoolController : MonoBehaviour
    {
        private readonly List<FishAgent> fishAgents = new List<FishAgent>();
        private readonly List<Vector3> schoolAnchors = new List<Vector3>();

        private SeafloorGenerator seafloor;

        public void Initialize(SeafloorGenerator floor)
        {
            seafloor = floor;
            BuildSchools();
        }

        private void Update()
        {
            if (fishAgents.Count == 0)
            {
                return;
            }

            var dt = Time.deltaTime;
            for (var schoolIndex = 0; schoolIndex < schoolAnchors.Count; schoolIndex++)
            {
                var anchor = schoolAnchors[schoolIndex];
                anchor += new Vector3(
                    Mathf.Sin(Time.time * 0.18f + schoolIndex) * 0.9f,
                    Mathf.Sin(Time.time * 0.31f + schoolIndex * 2f) * 0.18f,
                    Mathf.Cos(Time.time * 0.16f + schoolIndex) * 0.7f) * dt * 8f;

                var terrainHeight = seafloor.SampleHeight(anchor.x, anchor.z) + 4.6f;
                anchor.y = Mathf.Max(anchor.y, terrainHeight);
                schoolAnchors[schoolIndex] = anchor;
            }

            for (var i = 0; i < fishAgents.Count; i++)
            {
                var schoolIndex = i % schoolAnchors.Count;
                fishAgents[i].Tick(schoolAnchors[schoolIndex], dt);
            }
        }

        private void BuildSchools()
        {
            schoolAnchors.Clear();
            schoolAnchors.Add(new Vector3(-8f, -8f, -26f));
            schoolAnchors.Add(new Vector3(26f, -11f, 14f));
            schoolAnchors.Add(new Vector3(-32f, -14f, 32f));

            var materialA = CreateFishMaterial(new Color(0.21f, 0.78f, 0.91f), new Color(0.08f, 0.16f, 0.24f));
            var materialB = CreateFishMaterial(new Color(1f, 0.77f, 0.31f), new Color(0.36f, 0.22f, 0.11f));
            var materialC = CreateFishMaterial(new Color(0.83f, 0.92f, 1f), new Color(0.15f, 0.31f, 0.41f));

            for (var school = 0; school < schoolAnchors.Count; school++)
            {
                var schoolRoot = new GameObject("Fish School " + (school + 1)).transform;
                schoolRoot.SetParent(transform, false);

                for (var i = 0; i < 14; i++)
                {
                    var fishObject = new GameObject("Fish " + i);
                    fishObject.transform.SetParent(schoolRoot, false);
                    var fishAgent = fishObject.AddComponent<FishAgent>();
                    var jitter = new Vector3(Random.Range(-2.2f, 2.2f), Random.Range(-1.1f, 1.1f), Random.Range(-2.2f, 2.2f));
                    var start = schoolAnchors[school] + jitter;
                    var terrainHeight = seafloor.SampleHeight(start.x, start.z) + 3.6f;
                    start.y = Mathf.Max(start.y, terrainHeight);
                    var velocity = new Vector3(Random.Range(-1f, 1f), Random.Range(-0.15f, 0.15f), Random.Range(-1f, 1f));
                    var scale = Random.Range(0.7f, 1.15f);
                    var material = school == 0 ? materialA : school == 1 ? materialB : materialC;
                    fishAgent.Initialize(start, velocity, scale, material, school * 100 + i);
                    fishAgents.Add(fishAgent);
                }
            }
        }

        private static Material CreateFishMaterial(Color body, Color accent)
        {
            var material = new Material(Shader.Find("Standard"))
            {
                color = body
            };
            material.SetFloat("_Glossiness", 0.55f);
            material.SetFloat("_Metallic", 0f);
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor", accent * 0.24f);
            return material;
        }
    }
}
