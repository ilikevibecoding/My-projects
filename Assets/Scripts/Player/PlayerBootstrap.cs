using SubnauticaClone.Interaction;
using SubnauticaClone.Rendering;
using SubnauticaClone.World;
using UnityEngine;

namespace SubnauticaClone.Player
{
    public class PlayerBootstrap : MonoBehaviour
    {
        private ScannerToolController scannerTool;

        public ScannerToolController ScannerTool => scannerTool;

        public void Initialize(SeafloorGenerator seafloor, ScanProgressTracker tracker, float waterSurfaceHeight, float reefSize)
        {
            transform.position = new Vector3(0f, -8f, -72f);
            transform.rotation = Quaternion.identity;

            var lookPivot = new GameObject("LookPivot").transform;
            lookPivot.SetParent(transform, false);
            lookPivot.localPosition = new Vector3(0f, 0.18f, 0f);

            var existingCamera = Camera.main;
            var cameraObject = existingCamera != null ? existingCamera.gameObject : new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            cameraObject.transform.SetParent(lookPivot, false);
            cameraObject.transform.localPosition = Vector3.zero;
            cameraObject.transform.localRotation = Quaternion.identity;

            var camera = existingCamera != null ? existingCamera : cameraObject.AddComponent<Camera>();
            camera.nearClipPlane = 0.03f;
            camera.farClipPlane = 280f;
            camera.fieldOfView = 78f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.014f, 0.11f, 0.16f, 1f);
            camera.depthTextureMode = DepthTextureMode.Depth;

            if (cameraObject.GetComponent<AudioListener>() == null)
            {
                var listeners = Object.FindObjectsByType<AudioListener>(FindObjectsSortMode.None);
                for (var i = 0; i < listeners.Length; i++)
                {
                    if (listeners[i] != null && listeners[i].gameObject != cameraObject)
                    {
                        listeners[i].enabled = false;
                    }
                }

                cameraObject.AddComponent<AudioListener>();
            }

            var postEffect = cameraObject.GetComponent<UnderwaterPostEffect>();
            if (postEffect == null)
            {
                postEffect = cameraObject.AddComponent<UnderwaterPostEffect>();
            }
            postEffect.Initialize();

            var mouseLook = gameObject.AddComponent<MouseLook>();
            mouseLook.Initialize(lookPivot);

            var swimController = gameObject.AddComponent<SwimController>();
            swimController.Initialize(camera.transform, seafloor, waterSurfaceHeight, reefSize);

            scannerTool = cameraObject.AddComponent<ScannerToolController>();
            scannerTool.Initialize(camera, tracker);
        }
    }
}
