using UnityEngine;

namespace SubnauticaClone.UI
{
    public class RadarSweepController : MonoBehaviour
    {
        [SerializeField] private float sweepSpeed = 48f;
        [SerializeField] private CanvasGroup pulseGroup;

        private RectTransform rectTransform;

        private void Awake()
        {
            rectTransform = transform as RectTransform;
        }

        public void Initialize(CanvasGroup group)
        {
            pulseGroup = group;
            rectTransform = transform as RectTransform;
        }

        private void Update()
        {
            if (rectTransform == null)
            {
                return;
            }

            rectTransform.Rotate(0f, 0f, -sweepSpeed * Time.deltaTime);
            if (pulseGroup != null)
            {
                pulseGroup.alpha = 0.55f + Mathf.Sin(Time.time * 2.4f) * 0.18f;
            }
        }
    }
}
