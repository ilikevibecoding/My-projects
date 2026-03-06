using UnityEngine;

namespace SubnauticaClone.Interaction
{
    public class ScannableTarget : MonoBehaviour
    {
        [SerializeField] private string displayName = "Unknown Signature";
        [SerializeField] private float scanDuration = 1.8f;
        [SerializeField] private Color accentColor = new Color(0.22f, 0.96f, 1f, 1f);

        public string DisplayName => displayName;
        public float ScanDuration => Mathf.Max(0.25f, scanDuration);
        public Color AccentColor => accentColor;
        public bool IsScanned { get; private set; }

        private Renderer[] cachedRenderers;

        private void Awake()
        {
            cachedRenderers = GetComponentsInChildren<Renderer>(true);
        }

        private void OnEnable()
        {
            ScanProgressTracker.Instance?.RegisterTarget(this);
        }

        private void OnDisable()
        {
            if (ScanProgressTracker.Instance != null)
            {
                ScanProgressTracker.Instance.UnregisterTarget(this);
            }
        }

        public void Initialize(string targetName, float duration, Color color)
        {
            displayName = targetName;
            scanDuration = duration;
            accentColor = color;
            cachedRenderers = GetComponentsInChildren<Renderer>(true);
            ScanProgressTracker.Instance?.RegisterTarget(this);
        }

        public void MarkScanned()
        {
            if (IsScanned)
            {
                return;
            }

            IsScanned = true;
            ScanProgressTracker.Instance?.MarkScanned(this);

            if (cachedRenderers == null || cachedRenderers.Length == 0)
            {
                return;
            }

            for (var i = 0; i < cachedRenderers.Length; i++)
            {
                var renderer = cachedRenderers[i];
                if (renderer == null || renderer.sharedMaterial == null)
                {
                    continue;
                }

                var material = renderer.material;
                if (material.HasProperty("_ScanGlow"))
                {
                    material.SetFloat("_ScanGlow", 1f);
                }

                if (material.HasProperty("_EmissionColor"))
                {
                    material.EnableKeyword("_EMISSION");
                    material.SetColor("_EmissionColor", accentColor * 1.8f);
                }
            }
        }
    }
}
