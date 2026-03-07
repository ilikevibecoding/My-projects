using SubnauticaClone.GiftPhone;
using UnityEngine;

namespace SubnauticaClone.Bootstrap
{
    public static class RuntimeBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void EnsurePrototypeBootstrap()
        {
            if (Object.FindFirstObjectByType<GiftPhoneBootstrap>() != null ||
                Object.FindFirstObjectByType<PrototypeBootstrap>() != null)
            {
                return;
            }

            var bootstrapObject = new GameObject("Gift Phone Bootstrap");
            bootstrapObject.AddComponent<GiftPhoneBootstrap>();
        }
    }
}
