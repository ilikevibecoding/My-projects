using SubnauticaClone.Common;
using UnityEngine;

namespace SubnauticaClone.World
{
    public class ParticleFieldController : MonoBehaviour
    {
        public void Initialize(float reefSize, float waterSurfaceHeight)
        {
            CreateDustField(reefSize, waterSurfaceHeight);
            CreateBubbleColumns();
        }

        private void CreateDustField(float reefSize, float waterSurfaceHeight)
        {
            var dustObject = new GameObject("Plankton Dust");
            dustObject.transform.SetParent(transform, false);

            var system = dustObject.AddComponent<ParticleSystem>();
            var renderer = dustObject.GetComponent<ParticleSystemRenderer>();

            var main = system.main;
            main.loop = true;
            main.playOnAwake = true;
            main.maxParticles = 2400;
            main.startLifetime = 12f;
            main.startSpeed = 0.08f;
            main.startSize = new ParticleSystem.MinMaxCurve(0.03f, 0.12f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(0.74f, 0.95f, 1f, 0.1f), new Color(0.95f, 0.96f, 0.82f, 0.16f));
            main.simulationSpace = ParticleSystemSimulationSpace.World;

            var emission = system.emission;
            emission.rateOverTime = 180f;

            var shape = system.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(reefSize, waterSurfaceHeight + 24f, reefSize);
            dustObject.transform.position = new Vector3(0f, -8f, 0f);

            var velocity = system.velocityOverLifetime;
            velocity.enabled = true;
            velocity.space = ParticleSystemSimulationSpace.World;
            velocity.x = new ParticleSystem.MinMaxCurve(-0.04f, 0.06f);
            velocity.y = new ParticleSystem.MinMaxCurve(-0.02f, 0.04f);
            velocity.z = new ParticleSystem.MinMaxCurve(-0.06f, 0.04f);

            var texture = ProceduralTextureFactory.CreateSoftCircleTexture(64, new Color(1f, 1f, 1f, 0.85f), new Color(1f, 1f, 1f, 0f));
            var material = new Material(Shader.Find("Particles/Standard Unlit"));
            material.mainTexture = texture;
            renderer.material = material;
            renderer.alignment = ParticleSystemRenderSpace.View;
            renderer.sortMode = ParticleSystemSortMode.Distance;

            system.Play();
        }

        private void CreateBubbleColumns()
        {
            var positions = new[]
            {
                new Vector3(-20f, -18f, -40f),
                new Vector3(10f, -16f, -4f),
                new Vector3(36f, -20f, 24f)
            };

            for (var i = 0; i < positions.Length; i++)
            {
                var bubbleObject = new GameObject("Bubble Column " + (i + 1));
                bubbleObject.transform.SetParent(transform, false);
                bubbleObject.transform.position = positions[i];

                var system = bubbleObject.AddComponent<ParticleSystem>();
                var renderer = bubbleObject.GetComponent<ParticleSystemRenderer>();
                var main = system.main;
                main.loop = true;
                main.playOnAwake = true;
                main.maxParticles = 180;
                main.startLifetime = new ParticleSystem.MinMaxCurve(4f, 7f);
                main.startSpeed = new ParticleSystem.MinMaxCurve(1f, 2.8f);
                main.startSize = new ParticleSystem.MinMaxCurve(0.06f, 0.18f);
                main.startColor = new ParticleSystem.MinMaxGradient(new Color(0.75f, 0.95f, 1f, 0.45f), new Color(1f, 1f, 1f, 0.18f));
                main.simulationSpace = ParticleSystemSimulationSpace.World;

                var emission = system.emission;
                emission.rateOverTime = 14f;

                var shape = system.shape;
                shape.shapeType = ParticleSystemShapeType.ConeVolume;
                shape.angle = 6f;
                shape.radius = 0.32f;

                var noise = system.noise;
                noise.enabled = true;
                noise.strength = 0.18f;
                noise.frequency = 0.4f;
                noise.scrollSpeed = 0.3f;

                var texture = ProceduralTextureFactory.CreateSoftCircleTexture(64, new Color(1f, 1f, 1f, 0.7f), new Color(1f, 1f, 1f, 0f));
                var material = new Material(Shader.Find("Particles/Standard Unlit"));
                material.mainTexture = texture;
                renderer.material = material;
                renderer.alignment = ParticleSystemRenderSpace.View;

                system.Play();
            }
        }
    }
}
