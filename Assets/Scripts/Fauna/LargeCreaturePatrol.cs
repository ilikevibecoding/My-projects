using UnityEngine;

namespace SubnauticaClone.Fauna
{
    public class LargeCreaturePatrol : MonoBehaviour
    {
        private Transform creatureRoot;
        private float waterSurfaceHeight;

        public void Initialize(float surfaceHeight)
        {
            waterSurfaceHeight = surfaceHeight;
            BuildCreature();
        }

        private void Update()
        {
            if (creatureRoot == null)
            {
                return;
            }

            var t = Time.time * 0.08f;
            var position = new Vector3(
                Mathf.Cos(t) * 72f,
                Mathf.Lerp(-12f, waterSurfaceHeight - 12f, 0.08f + Mathf.Sin(t * 1.7f) * 0.02f),
                Mathf.Sin(t * 0.84f) * 58f);
            creatureRoot.position = position;

            var future = new Vector3(
                Mathf.Cos(t + 0.01f) * 72f,
                Mathf.Lerp(-12f, waterSurfaceHeight - 12f, 0.08f + Mathf.Sin((t + 0.01f) * 1.7f) * 0.02f),
                Mathf.Sin((t + 0.01f) * 0.84f) * 58f);
            var direction = (future - position).normalized;
            if (direction.sqrMagnitude > 0.01f)
            {
                creatureRoot.rotation = Quaternion.Slerp(creatureRoot.rotation, Quaternion.LookRotation(direction, Vector3.up), 1f - Mathf.Exp(-2.5f * Time.deltaTime));
            }
        }

        private void BuildCreature()
        {
            creatureRoot = new GameObject("Leviathan Silhouette").transform;
            creatureRoot.SetParent(transform, false);

            var bodyMaterial = new Material(Shader.Find("Standard"))
            {
                color = new Color(0.03f, 0.09f, 0.14f)
            };
            bodyMaterial.SetFloat("_Glossiness", 0.28f);

            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.transform.SetParent(creatureRoot, false);
            body.transform.localRotation = Quaternion.Euler(0f, 0f, 90f);
            body.transform.localScale = new Vector3(3.6f, 4.8f, 2.4f);
            body.GetComponent<Renderer>().sharedMaterial = bodyMaterial;
            Destroy(body.GetComponent<Collider>());

            var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.transform.SetParent(creatureRoot, false);
            head.transform.localPosition = new Vector3(5.2f, 0.4f, 0f);
            head.transform.localScale = new Vector3(2.6f, 2.2f, 1.9f);
            head.GetComponent<Renderer>().sharedMaterial = bodyMaterial;
            Destroy(head.GetComponent<Collider>());

            var tail = GameObject.CreatePrimitive(PrimitiveType.Cube);
            tail.transform.SetParent(creatureRoot, false);
            tail.transform.localPosition = new Vector3(-6.1f, 0f, 0f);
            tail.transform.localScale = new Vector3(3.8f, 0.7f, 2f);
            tail.GetComponent<Renderer>().sharedMaterial = bodyMaterial;
            Destroy(tail.GetComponent<Collider>());

            var finTop = GameObject.CreatePrimitive(PrimitiveType.Cube);
            finTop.transform.SetParent(creatureRoot, false);
            finTop.transform.localPosition = new Vector3(-0.4f, 2.2f, 0f);
            finTop.transform.localRotation = Quaternion.Euler(0f, 0f, 28f);
            finTop.transform.localScale = new Vector3(2.6f, 0.25f, 1.4f);
            finTop.GetComponent<Renderer>().sharedMaterial = bodyMaterial;
            Destroy(finTop.GetComponent<Collider>());
        }
    }
}
