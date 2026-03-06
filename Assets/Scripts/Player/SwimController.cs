using SubnauticaClone.World;
using UnityEngine;

namespace SubnauticaClone.Player
{
    public class SwimController : MonoBehaviour
    {
        [SerializeField] private Transform movementReference;
        [SerializeField] private float cruiseSpeed = 8f;
        [SerializeField] private float burstSpeed = 12.5f;
        [SerializeField] private float acceleration = 4.8f;
        [SerializeField] private float damping = 1.8f;
        [SerializeField] private float buoyancyBob = 0.16f;
        [SerializeField] private float buoyancyFrequency = 0.85f;
        [SerializeField] private float floorClearance = 2.3f;

        private SeafloorGenerator seafloor;
        private float waterSurfaceHeight;
        private float reefSize;
        private Vector3 velocity;

        public Vector3 Velocity => velocity;

        public void Initialize(Transform reference, SeafloorGenerator floor, float surfaceHeight, float worldSize)
        {
            movementReference = reference;
            seafloor = floor;
            waterSurfaceHeight = surfaceHeight;
            reefSize = worldSize;
        }

        private void Update()
        {
            if (movementReference == null)
            {
                return;
            }

            var forward = movementReference.forward;
            var right = movementReference.right;
            var input = Vector3.zero;

            input += forward * Input.GetAxisRaw("Vertical");
            input += right * Input.GetAxisRaw("Horizontal");
            input += Vector3.up * ((Input.GetKey(KeyCode.Space) ? 1f : 0f) - (Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.C) ? 1f : 0f));

            var hasInput = input.sqrMagnitude > 0.001f;
            if (hasInput)
            {
                input.Normalize();
            }

            var speed = Input.GetKey(KeyCode.LeftShift) ? burstSpeed : cruiseSpeed;
            var targetVelocity = input * speed;
            velocity = Vector3.Lerp(velocity, targetVelocity, 1f - Mathf.Exp(-acceleration * Time.deltaTime));
            velocity *= 1f / (1f + damping * Time.deltaTime * (hasInput ? 0.1f : 1f));

            var bob = Mathf.Sin(Time.time * buoyancyFrequency) * buoyancyBob;
            transform.position += (velocity + Vector3.up * bob) * Time.deltaTime;
            ClampToWorld();
        }

        private void ClampToWorld()
        {
            var position = transform.position;
            var halfSize = reefSize * 0.5f - 8f;
            position.x = Mathf.Clamp(position.x, -halfSize, halfSize);
            position.z = Mathf.Clamp(position.z, -halfSize, halfSize);

            if (seafloor != null)
            {
                var terrainHeight = seafloor.SampleHeight(position.x, position.z) + floorClearance;
                position.y = Mathf.Max(position.y, terrainHeight);
            }

            position.y = Mathf.Min(position.y, waterSurfaceHeight - 1.35f);
            transform.position = position;
        }
    }
}
