Shader "SubnauticaClone/WaterSurface"
{
    Properties
    {
        _ShallowColor("Shallow Color", Color) = (0.16, 0.9, 0.88, 0.45)
        _DeepColor("Deep Color", Color) = (0.02, 0.2, 0.34, 0.68)
        _RippleStrength("Ripple Strength", Range(0, 1)) = 0.18
        _FresnelPower("Fresnel Power", Range(0.1, 8)) = 3.6
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent"
            "RenderType" = "Transparent"
        }

        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            fixed4 _ShallowColor;
            fixed4 _DeepColor;
            float _RippleStrength;
            float _FresnelPower;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 worldPos : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float2 uv : TEXCOORD2;
            };

            v2f vert(appdata v)
            {
                v2f o;
                float waveA = sin((v.vertex.x + _Time.y * 1.4) * 0.4) * 0.12;
                float waveB = cos((v.vertex.z - _Time.y * 1.2) * 0.36) * 0.1;
                v.vertex.y += (waveA + waveB) * _RippleStrength;

                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.uv = v.uv;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 viewDir = normalize(_WorldSpaceCameraPos.xyz - i.worldPos);
                float fresnel = pow(1.0 - saturate(dot(normalize(i.worldNormal), viewDir)), _FresnelPower);
                float shimmer = sin(i.worldPos.x * 0.22 + _Time.y * 3.0) * 0.5 + 0.5;
                shimmer += cos(i.worldPos.z * 0.2 - _Time.y * 2.6) * 0.5 + 0.5;
                shimmer *= 0.5;

                float3 color = lerp(_DeepColor.rgb, _ShallowColor.rgb, saturate(fresnel * 0.85 + shimmer * 0.2));
                float alpha = saturate(_DeepColor.a + fresnel * 0.18 + shimmer * 0.06);
                return fixed4(color, alpha);
            }
            ENDCG
        }
    }
}
