using SubnauticaClone.Interaction;
using UnityEngine;

namespace SubnauticaClone.Player
{
    public class ScannerToolController : MonoBehaviour
    {
        [SerializeField] private Camera playerCamera;
        [SerializeField] private ScanProgressTracker tracker;
        [SerializeField] private float scanRange = 18f;

        private Transform scannerRoot;
        private ScannableTarget currentTarget;
        private ScannableTarget previousTarget;
        private float currentScanTime;

        public ScannableTarget CurrentTarget => currentTarget;
        public float ScanProgressNormalized => currentTarget == null ? 0f : Mathf.Clamp01(currentScanTime / currentTarget.ScanDuration);
        public bool IsScanning => currentTarget != null && Input.GetKey(KeyCode.E);

        public void Initialize(Camera sourceCamera, ScanProgressTracker progressTracker)
        {
            playerCamera = sourceCamera;
            tracker = progressTracker;
            scannerRoot = BuildScannerModel(sourceCamera.transform);
        }

        private void Update()
        {
            if (playerCamera == null)
            {
                return;
            }

            UpdateScannerSway();
            UpdateScanTarget();
        }

        private void UpdateScannerSway()
        {
            if (scannerRoot == null)
            {
                return;
            }

            var swayX = Input.GetAxisRaw("Mouse X") * -0.03f;
            var swayY = Input.GetAxisRaw("Mouse Y") * -0.025f;
            var swimRoll = Input.GetAxisRaw("Horizontal") * -3f;
            var targetPosition = new Vector3(0.54f + swayX, -0.48f + swayY, 1.02f);
            var targetRotation = Quaternion.Euler(18f + swayY * 55f, -16f + swayX * 65f, swimRoll);

            scannerRoot.localPosition = Vector3.Lerp(scannerRoot.localPosition, targetPosition, 1f - Mathf.Exp(-10f * Time.deltaTime));
            scannerRoot.localRotation = Quaternion.Slerp(scannerRoot.localRotation, targetRotation, 1f - Mathf.Exp(-10f * Time.deltaTime));
        }

        private void UpdateScanTarget()
        {
            currentTarget = null;
            var ray = playerCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
            if (Physics.Raycast(ray, out var hit, scanRange, ~LayerMask.GetMask("Ignore Raycast"), QueryTriggerInteraction.Ignore))
            {
                currentTarget = hit.collider.GetComponentInParent<ScannableTarget>();
            }

            if (currentTarget != previousTarget)
            {
                currentScanTime = 0f;
                previousTarget = currentTarget;
            }

            if (currentTarget == null || currentTarget.IsScanned)
            {
                currentScanTime = Mathf.Max(0f, currentScanTime - Time.deltaTime * 2f);
                return;
            }

            if (Input.GetKey(KeyCode.E))
            {
                currentScanTime += Time.deltaTime;
                if (currentScanTime >= currentTarget.ScanDuration)
                {
                    currentTarget.MarkScanned();
                    tracker?.MarkScanned(currentTarget);
                    currentScanTime = 0f;
                }
            }
            else
            {
                currentScanTime = Mathf.Max(0f, currentScanTime - Time.deltaTime);
            }
        }

        private static Transform BuildScannerModel(Transform parent)
        {
            var root = new GameObject("ScannerTool").transform;
            root.SetParent(parent, false);
            root.localPosition = new Vector3(0.54f, -0.48f, 1.02f);
            root.localRotation = Quaternion.Euler(18f, -16f, 0f);

            var grip = GameObject.CreatePrimitive(PrimitiveType.Cube);
            grip.name = "Grip";
            grip.transform.SetParent(root, false);
            grip.transform.localPosition = new Vector3(0.08f, -0.09f, -0.05f);
            grip.transform.localScale = new Vector3(0.12f, 0.28f, 0.12f);

            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            body.name = "Body";
            body.transform.SetParent(root, false);
            body.transform.localPosition = new Vector3(0f, 0f, 0f);
            body.transform.localScale = new Vector3(0.3f, 0.14f, 0.48f);

            var barrel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            barrel.name = "Emitter";
            barrel.transform.SetParent(root, false);
            barrel.transform.localPosition = new Vector3(0f, 0.005f, 0.22f);
            barrel.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            barrel.transform.localScale = new Vector3(0.11f, 0.05f, 0.11f);

            var panel = GameObject.CreatePrimitive(PrimitiveType.Quad);
            panel.name = "ScannerGlass";
            panel.transform.SetParent(root, false);
            panel.transform.localPosition = new Vector3(0f, 0.23f, 0.11f);
            panel.transform.localScale = new Vector3(0.34f, 0.34f, 0.34f);

            ApplyMaterial(grip.GetComponent<Renderer>(), new Color(0.95f, 0.97f, 1f), 0.2f, 0.45f);
            ApplyMaterial(body.GetComponent<Renderer>(), new Color(0.92f, 0.95f, 0.98f), 0.12f, 0.35f);
            ApplyMaterial(barrel.GetComponent<Renderer>(), new Color(0.14f, 0.2f, 0.26f), 0f, 0.75f);

            var glassShader = Shader.Find("SubnauticaClone/ScannerGlass");
            var glassMaterial = new Material(glassShader == null ? Shader.Find("Legacy Shaders/Transparent/Diffuse") : glassShader)
            {
                name = "Runtime Scanner Glass"
            };
            if (glassMaterial.HasProperty("_Tint"))
            {
                glassMaterial.SetColor("_Tint", new Color(0.38f, 0.97f, 1f, 0.55f));
            }

            panel.GetComponent<Renderer>().sharedMaterial = glassMaterial;

            SetIgnoreRaycastRecursive(root.gameObject);
            return root;
        }

        private static void ApplyMaterial(Renderer renderer, Color color, float metallic, float smoothness)
        {
            var material = new Material(Shader.Find("Standard"))
            {
                color = color
            };
            material.SetFloat("_Metallic", metallic);
            material.SetFloat("_Glossiness", smoothness);
            renderer.sharedMaterial = material;
        }

        private static void SetIgnoreRaycastRecursive(GameObject root)
        {
            root.layer = LayerMask.NameToLayer("Ignore Raycast");
            foreach (Transform child in root.transform)
            {
                SetIgnoreRaycastRecursive(child.gameObject);
            }
        }
    }
}
