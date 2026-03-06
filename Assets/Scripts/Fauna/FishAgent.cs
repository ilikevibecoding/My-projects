using UnityEngine;

namespace SubnauticaClone.Fauna
{
    public class FishAgent : MonoBehaviour
    {
        private Vector3 anchor;
        private Vector3 velocity;
        private float swimScale;
        private float phase;

        public void Initialize(Vector3 spawnPoint, Vector3 initialVelocity, float scale, Material material, int seed)
        {
            anchor = spawnPoint;
            velocity = initialVelocity;
            swimScale = scale;
            phase = seed * 0.17f;

            transform.position = spawnPoint;
            BuildVisual(material, scale);
        }

        public void Tick(Vector3 schoolCenter, float dt)
        {
            var localNoise = new Vector3(
                Mathf.Sin(Time.time * 0.8f + phase),
                Mathf.Sin(Time.time * 1.3f + phase * 1.7f) * 0.35f,
                Mathf.Cos(Time.time * 1.1f + phase)) * 0.7f;
            var desired = (schoolCenter + localNoise - transform.position).normalized * 2.8f;
            velocity = Vector3.Lerp(velocity, desired, 1f - Mathf.Exp(-2.6f * dt));
            transform.position += velocity * dt;

            if (velocity.sqrMagnitude > 0.01f)
            {
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(velocity.normalized, Vector3.up), 1f - Mathf.Exp(-5f * dt));
            }

            var tailSwing = Mathf.Sin(Time.time * 8f + phase) * 16f;
            transform.GetChild(0).localRotation = Quaternion.Euler(0f, 0f, 90f);
            transform.GetChild(1).localRotation = Quaternion.Euler(0f, 0f, tailSwing);
        }

        private void BuildVisual(Material material, float scale)
        {
            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "Body";
            body.transform.SetParent(transform, false);
            body.transform.localRotation = Quaternion.Euler(0f, 0f, 90f);
            body.transform.localScale = new Vector3(0.26f, 0.3f, 0.18f) * scale;
            body.GetComponent<Renderer>().sharedMaterial = material;
            Object.Destroy(body.GetComponent<Collider>());

            var tail = GameObject.CreatePrimitive(PrimitiveType.Cube);
            tail.name = "Tail";
            tail.transform.SetParent(transform, false);
            tail.transform.localPosition = new Vector3(-0.34f * scale, 0f, 0f);
            tail.transform.localScale = new Vector3(0.12f, 0.26f, 0.02f) * scale;
            tail.GetComponent<Renderer>().sharedMaterial = material;
            Object.Destroy(tail.GetComponent<Collider>());

            var dorsal = GameObject.CreatePrimitive(PrimitiveType.Cube);
            dorsal.name = "Dorsal";
            dorsal.transform.SetParent(transform, false);
            dorsal.transform.localPosition = new Vector3(0f, 0.11f * scale, 0f);
            dorsal.transform.localScale = new Vector3(0.16f, 0.05f, 0.02f) * scale;
            dorsal.GetComponent<Renderer>().sharedMaterial = material;
            Object.Destroy(dorsal.GetComponent<Collider>());
        }
    }
}
