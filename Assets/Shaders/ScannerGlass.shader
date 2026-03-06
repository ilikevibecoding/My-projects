Shader "SubnauticaClone/ScannerGlass"
{
    Properties
    {
        _Tint("Tint", Color) = (0.38, 0.97, 1, 0.55)
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent"
            "RenderType" = "Transparent"
        }

        Blend SrcAlpha One
        Cull Off
        ZWrite Off

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            fixed4 _Tint;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 centered = i.uv * 2.0 - 1.0;
                float radius = length(centered);
                float ring1 = 1.0 - smoothstep(0.0, 0.02, abs(radius - 0.4));
                float ring2 = 1.0 - smoothstep(0.0, 0.02, abs(radius - 0.7));
                float grid = (1.0 - smoothstep(0.0, 0.015, abs(frac(i.uv.x * 12.0) - 0.5))) * 0.12;
                grid += (1.0 - smoothstep(0.0, 0.015, abs(frac(i.uv.y * 12.0) - 0.5))) * 0.12;
                float angle = frac(_Time.y * 0.25 + atan2(centered.y, centered.x) / 6.28318);
                float sweep = 1.0 - smoothstep(0.0, 0.09, abs(angle - 0.5));
                float alpha = saturate((1.0 - radius) * 0.18 + ring1 + ring2 + grid + sweep * 0.3);
                return fixed4(_Tint.rgb * alpha, alpha * _Tint.a);
            }
            ENDCG
        }
    }
}
