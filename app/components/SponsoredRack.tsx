'use client';

import React, { useEffect } from 'react';

const SponsoredRack = () => {
    useEffect(() => {
        try {
            // @ts-ignore
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            console.error('AdSense Error', e);
        }
    }, []);

    return (
        <div className="rack-panel p-4 flex flex-col gap-3 min-h-[150px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex flex-col">
                    <span className="text-[7px] text-zinc-600 font-black tracking-[0.4em] uppercase">Featured</span>
                    <h3 className="text-zinc-400 text-[9px] font-black tracking-widest uppercase">GEAR_MODULE_AD</h3>
                </div>
                <div className="flex gap-1">
                    <div className="w-1 h-1 rounded-full bg-amber-500/50" />
                    <div className="w-1 h-1 rounded-full bg-zinc-800" />
                </div>
            </div>

            <div className="flex-grow flex items-center justify-center bg-zinc-950/40 border border-white/5 rounded-sm relative overflow-hidden group">

                {/* AdSense Container */}
                <ins className="adsbygoogle"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                    data-ad-client="ca-pub-YOUR_CLIENT_ID"
                    data-ad-slot="YOUR_AD_SLOT"
                    data-ad-format="fluid"
                    data-full-width-responsive="true"></ins>

                {/* Note: For Carbon Ads, you would replace the <ins> block with:
            <script async type="text/javascript" src="//cdn.carbonads.com/carbon.js?serve=YOUR_ZONE_ID&placement=YOUR_DOMAIN" id="_carbonads_js"></script>
         */}

                {/* Decorative scanline effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/[0.01] to-transparent pointer-events-none group-hover:via-amber-500/[0.03] transition-all" />
            </div>

            <div className="flex justify-between items-center px-1">
                <span className="text-[6px] text-zinc-700 font-mono">ID: GEAR_M1_PRO</span>
                <div className="flex gap-0.5">
                    <div className="w-2 h-0.5 bg-zinc-800" />
                    <div className="w-2 h-0.5 bg-zinc-800" />
                </div>
            </div>
        </div>
    );
};

export default SponsoredRack;
