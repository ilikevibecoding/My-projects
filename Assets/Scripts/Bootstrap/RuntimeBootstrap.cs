using UnityEngine;

namespace SubnauticaClone.Bootstrap
{
    public static class RuntimeBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void EnsurePrototypeBootstrap()
        {
            if (Object.FindFirstObjectByType<PrototypeBootstrap>() != null)
            {
                return;
            }

            var bootstrapObject = new GameObject("Subnautica Prototype Bootstrap");
            bootstrapObject.AddComponent<PrototypeBootstrap>();
        }
    }
}
