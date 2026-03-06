Shader "Hidden/SubnauticaClone/UnderwaterPost"
{
    Properties
    {
        _MainTex("MainTex", 2D) = "white" {}
        _NearTint("Near Tint", Color) = (0.08, 0.53, 0.62, 1)
        _FarTint("Far Tint", Color) = (0.02, 0.13, 0.19, 1)
        _FogStrength("Fog Strength", Range(0, 1)) = 0.82
        _DistortionStrength("Distortion Strength", Range(0, 0.02)) = 0.0035
    }

    SubShader
    {
        Cull Off
        ZWrite Off
        ZTest Always

        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            sampler2D _CameraDepthTexture;
            fixed4 _NearTint;
            fixed4 _FarTint;
            float _FogStrength;
            float _DistortionStrength;

            fixed4 frag(v2f_img i) : SV_Target
            {
                float2 centered = i.uv * 2.0 - 1.0;
                float distortion = (sin(i.uv.y * 24.0 + _Time.y * 1.9) + cos(i.uv.x * 19.0 - _Time.y * 1.7)) * 0.5;
                float2 uv = i.uv + centered.yx * distortion * _DistortionStrength;

                fixed4 color = tex2D(_MainTex, uv);
                float rawDepth = SAMPLE_DEPTH_TEXTURE(_CameraDepthTexture, i.uv);
                float sceneDepth = Linear01Depth(rawDepth);
                float fog = saturate(sceneDepth * _FogStrength * 1.15);
                float vignette = saturate(dot(centered, centered) * 0.22);
                float shimmer = sin((i.uv.x + i.uv.y + _Time.y * 0.14) * 32.0) * 0.5 + 0.5;

                fixed3 tint = lerp(_NearTint.rgb, _FarTint.rgb, saturate(fog + vignette * 0.35));
                color.rgb = lerp(color.rgb, color.rgb * tint, saturate(fog + 0.12));
                color.rgb += shimmer * 0.035 * (1.0 - fog);
                return color;
            }
            ENDCG
        }
    }
}
