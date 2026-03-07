using UnityEngine;
using SubnauticaClone.UI;

namespace SubnauticaClone.Bootstrap
{
    public static class RuntimeBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void EnsureVirtualPhoneBootstrap()
        {
            if (Object.FindFirstObjectByType<VirtualPhoneBootstrap>() != null)
            {
                return;
            }

            var bootstrapObject = new GameObject("Virtual Phone Bootstrap");
            bootstrapObject.AddComponent<VirtualPhoneBootstrap>();
        }
    }
}
