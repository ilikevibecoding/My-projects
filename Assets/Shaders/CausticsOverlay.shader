Shader "SubnauticaClone/CausticsOverlay"
{
    Properties
    {
        _BaseShallow("Base Shallow", Color) = (0.86, 0.78, 0.58, 1)
        _BaseDeep("Base Deep", Color) = (0.18, 0.28, 0.25, 1)
        _Accent("Accent", Color) = (0.95, 0.74, 0.38, 1)
        _Glossiness("Smoothness", Range(0, 1)) = 0.24
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        LOD 250

        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma target 3.0

        fixed4 _BaseShallow;
        fixed4 _BaseDeep;
        fixed4 _Accent;
        half _Glossiness;

        sampler2D _SubnauticaCausticsTex;
        float4 _SubnauticaCausticsOffsetA;
        float4 _SubnauticaCausticsOffsetB;
        float _SubnauticaCausticsPulse;
        float _SubnauticaCausticsIntensity;

        struct Input
        {
            float3 worldPos;
            float3 worldNormal;
        };

        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            float depthBlend = saturate((IN.worldPos.y + 26.0) / 18.0);
            float3 baseColor = lerp(_BaseDeep.rgb, _BaseShallow.rgb, depthBlend);

            float2 uvA = IN.worldPos.xz * 0.08 + _SubnauticaCausticsOffsetA.xy;
            float2 uvB = IN.worldPos.xz * 0.13 + _SubnauticaCausticsOffsetB.xy;
            float causticsA = tex2D(_SubnauticaCausticsTex, uvA).r;
            float causticsB = tex2D(_SubnauticaCausticsTex, uvB).r;
            float caustics = saturate((causticsA + causticsB) * 0.9) * _SubnauticaCausticsPulse * _SubnauticaCausticsIntensity;

            float slope = saturate(dot(normalize(IN.worldNormal), float3(0, 1, 0)));
            float3 accent = _Accent.rgb * caustics * (0.2 + slope * 0.8);

            o.Albedo = saturate(baseColor + accent);
            o.Metallic = 0.0;
            o.Smoothness = _Glossiness;
            o.Occlusion = lerp(0.85, 1.0, slope);
        }
        ENDCG
    }

    FallBack "Standard"
}
