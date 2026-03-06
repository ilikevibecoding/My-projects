Shader "SubnauticaClone/BioluminescentCoral"
{
    Properties
    {
        _BaseColor("Base Color", Color) = (1, 0.5, 0.25, 1)
        _GlowColor("Glow Color", Color) = (0.4, 0.95, 1, 1)
        [HDR]_EmissionColor("Emission Color", Color) = (0.4, 0.95, 1, 1)
        _Glossiness("Smoothness", Range(0, 1)) = 0.42
        _SurfaceHeight("Surface Height", Float) = 7.5
        _ScanGlow("Scan Glow", Range(0, 1)) = 0
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        LOD 250

        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0

        fixed4 _BaseColor;
        fixed4 _GlowColor;
        fixed4 _EmissionColor;
        half _Glossiness;
        float _SurfaceHeight;
        float _ScanGlow;

        sampler2D _SubnauticaCausticsTex;
        float4 _SubnauticaCausticsOffsetA;
        float _SubnauticaCausticsPulse;

        struct Input
        {
            float3 worldPos;
        };

        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            float altitude = saturate((_SurfaceHeight - IN.worldPos.y) / 18.0);
            float pulse = sin(_Time.y * 2.6 + IN.worldPos.x * 0.8 + IN.worldPos.z * 0.8) * 0.5 + 0.5;
            float2 causticUV = IN.worldPos.xz * 0.11 + _SubnauticaCausticsOffsetA.xy;
            float caustics = tex2D(_SubnauticaCausticsTex, causticUV).r * _SubnauticaCausticsPulse;

            o.Albedo = _BaseColor.rgb;
            o.Metallic = 0.0;
            o.Smoothness = _Glossiness;
            o.Emission = _GlowColor.rgb * (0.22 + pulse * 0.85) * (0.5 + altitude * 0.5) + _EmissionColor.rgb * _ScanGlow + caustics * 0.12;
        }
        ENDCG
    }

    FallBack "Standard"
}
