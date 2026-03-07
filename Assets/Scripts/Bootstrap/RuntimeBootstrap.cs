using UnityEngine;
using UnityEngine.SceneManagement;

namespace SubnauticaClone.Bootstrap
{
    public static class RuntimeBootstrap
    {
        private const string EvaPhoneSceneName = "EvaPhoneMockup";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void EnsurePrototypeBootstrap()
        {
            if (SceneManager.GetActiveScene().name == EvaPhoneSceneName)
            {
                if (Object.FindFirstObjectByType<PhoneGiftBootstrap>() != null)
                {
                    return;
                }

                var phoneBootstrapObject = new GameObject("Eva Phone Experience Bootstrap");
                phoneBootstrapObject.AddComponent<PhoneGiftBootstrap>();
                return;
            }

            if (Object.FindFirstObjectByType<PrototypeBootstrap>() != null)
            {
                return;
            }

            var bootstrapObject = new GameObject("Subnautica Prototype Bootstrap");
            bootstrapObject.AddComponent<PrototypeBootstrap>();
        }
    }
}
