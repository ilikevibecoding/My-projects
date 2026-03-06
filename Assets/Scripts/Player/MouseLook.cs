using UnityEngine;

namespace SubnauticaClone.Player
{
    public class MouseLook : MonoBehaviour
    {
        [SerializeField] private Transform pitchPivot;
        [SerializeField] private float sensitivity = 1.8f;
        [SerializeField] private float smoothing = 14f;
        [SerializeField] private float minPitch = -82f;
        [SerializeField] private float maxPitch = 82f;

        private float yaw;
        private float pitch;
        private Vector2 smoothedDelta;

        public Transform PitchPivot => pitchPivot;

        public void Initialize(Transform lookPivot)
        {
            pitchPivot = lookPivot;
            yaw = transform.eulerAngles.y;
            pitch = 0f;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        private void OnDisable()
        {
            if (Application.isPlaying)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        private void Update()
        {
            if (pitchPivot == null)
            {
                return;
            }

            if (Input.GetKeyDown(KeyCode.Escape))
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }

            if (Input.GetMouseButtonDown(0))
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }

            if (Cursor.lockState != CursorLockMode.Locked)
            {
                return;
            }

            var targetDelta = new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * sensitivity;
            smoothedDelta = Vector2.Lerp(smoothedDelta, targetDelta, 1f - Mathf.Exp(-smoothing * Time.deltaTime));

            yaw += smoothedDelta.x;
            pitch = Mathf.Clamp(pitch - smoothedDelta.y, minPitch, maxPitch);

            transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            pitchPivot.localRotation = Quaternion.Euler(pitch, 0f, 0f);
        }
    }
}
