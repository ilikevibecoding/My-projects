using System;
using System.Collections.Generic;
using UnityEngine;

namespace SubnauticaClone.Interaction
{
    public class ScanProgressTracker : MonoBehaviour
    {
        public static ScanProgressTracker Instance { get; private set; }

        public event Action ProgressChanged;

        public int TotalTargets => totalTargets;
        public int ScannedTargets => scannedTargets;
        public float CompletionRatio => totalTargets <= 0 ? 0f : scannedTargets / (float)totalTargets;

        private readonly HashSet<int> registeredIds = new HashSet<int>();
        private readonly HashSet<int> scannedIds = new HashSet<int>();

        private int totalTargets;
        private int scannedTargets;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
        }

        public void RegisterTarget(ScannableTarget target)
        {
            if (target == null)
            {
                return;
            }

            var id = target.GetInstanceID();
            if (!registeredIds.Add(id))
            {
                return;
            }

            totalTargets += 1;
            if (target.IsScanned && scannedIds.Add(id))
            {
                scannedTargets += 1;
            }

            ProgressChanged?.Invoke();
        }

        public void UnregisterTarget(ScannableTarget target)
        {
            if (target == null)
            {
                return;
            }

            var id = target.GetInstanceID();
            if (!registeredIds.Remove(id))
            {
                return;
            }

            totalTargets = Mathf.Max(0, totalTargets - 1);
            if (scannedIds.Remove(id))
            {
                scannedTargets = Mathf.Max(0, scannedTargets - 1);
            }

            ProgressChanged?.Invoke();
        }

        public void MarkScanned(ScannableTarget target)
        {
            if (target == null)
            {
                return;
            }

            var id = target.GetInstanceID();
            if (!registeredIds.Contains(id))
            {
                RegisterTarget(target);
            }

            if (!scannedIds.Add(id))
            {
                return;
            }

            scannedTargets += 1;
            ProgressChanged?.Invoke();
        }

        public string GetObjectiveText()
        {
            if (totalTargets <= 0)
            {
                return "Initializing scanner network...";
            }

            if (scannedTargets >= totalTargets)
            {
                return "All local signatures scanned. Enjoy the reef.";
            }

            return $"Scan local lifeforms and relics ({scannedTargets}/{totalTargets})";
        }
    }
}
