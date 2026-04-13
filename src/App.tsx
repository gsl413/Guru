import React, { useMemo, useState, useEffect } from "react";

type Service = "orbitRaising" | "stationKeeping" | "deorbiting";
type Thruster = "EMCAT" | "EMCAT MPD" | "JJDrive";

const EARTH_RADIUS = 6371e3;
const MU = 3.986004418e14;
const ORBITAL_VELOCITY = 7800;

const PLATFORM_AREAS: Record<string, number> = {
  "3U": 0.01, "6U": 0.03, "12U": 0.06, "24U": 0.12,
};

const THRUSTERS: Record<Thruster, { thrust: number; tp: number }> = {
  EMCAT: { thrust: 200e-6, tp: 12.5e-6 },
  "EMCAT MPD": { thrust: 2e-3, tp: 44e-6 },
  JJDrive: { thrust: 30e-3, tp: 44e-6 },
};

const DENSITY_TABLE: Record<number, number> = {
  100: 5.6044e-7, 150: 2.0752e-9, 200: 2.5407e-10, 250: 6.072e-11,
  300: 1.92e-11, 350: 7e-12, 400: 2.8e-12, 450: 1.1843e-12, 500: 5.2148e-13,
};

function interpolateDensity(altitude: number) {
  const keys = Object.keys(DENSITY_TABLE).map(Number).sort((a, b) => a - b);
  if (altitude <= keys[0]) return DENSITY_TABLE[keys[0]];
  if (altitude >= keys[keys.length - 1]) return DENSITY_TABLE[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const low = keys[i], high = keys[i + 1];
    if (altitude >= low && altitude <= high) {
      const t = (altitude - low) / (high - low);
      return DENSITY_TABLE[low] + t * (DENSITY_TABLE[high] - DENSITY_TABLE[low]);
    }
  }
  return DENSITY_TABLE[300];
}

export default function App() {
  const [services, setServices] = useState<Service[]>(["orbitRaising"]);
  const [platform, setPlatform] = useState("6U");
  const [frontalArea, setFrontalArea] = useState(0.03);
  const [isOverride, setIsOverride] = useState(false);
  
  const [mass, setMass] = useState(12);
  const [cd, setCd] = useState(2.2);
  const [powerAvailable, setPowerAvailable] = useState(100);
  const [thruster, setThruster] = useState<Thruster>("EMCAT MPD");
  
  const [initialAltitude, setInitialAltitude] = useState(300);
  const [finalAltitude, setFinalAltitude] = useState(500);
  const [skAltitude, setSkAltitude] = useState(300);
  const [duration, setDuration] = useState(1);
  const [ionVelocity, setIonVelocity] = useState(20000);
  const [deorbitAltitude, setDeorbitAltitude] = useState(500);

  // Sync Frontal Area with Platform Size unless overridden
  useEffect(() => {
    if (!isOverride && platform !== "Custom") {
      setFrontalArea(PLATFORM_AREAS[platform]);
    }
  }, [platform, isOverride]);

  const orbitRaising = useMemo(() => {
    if (!services.includes("orbitRaising")) return null;
    const r1 = EARTH_RADIUS + initialAltitude * 1000, r2 = EARTH_RADIUS + finalAltitude * 1000;
    const aTransfer = (r1 + r2) / 2;
    const dv1 = Math.sqrt(MU / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
    const dv2 = Math.sqrt(MU / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
    const baseline = Math.abs(dv1) + Math.abs(dv2);
    const density = interpolateDensity(initialAltitude);
    const dragAcc = 0.5 * (cd * frontalArea / mass) * density * Math.pow(ORBITAL_VELOCITY, 2);
    const semiMajorDecay = (-2 * Math.pow(aTransfer, 1.5) * dragAcc) / Math.sqrt(MU);
    const transferTime = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / MU);
    const dragDeltaV = (Math.abs(semiMajorDecay) * transferTime * ORBITAL_VELOCITY) / (2 * r1);
    const dragForce = 0.5 * density * Math.pow(ORBITAL_VELOCITY, 2) * cd * frontalArea;
    return { 
        totalDeltaV: baseline + dragDeltaV, dragDeltaV, transferTime, dragForce, 
        power: dragForce / THRUSTERS[thruster].tp, impulse: mass * (baseline + dragDeltaV), semiMajorDecay 
    };
  }, [services, initialAltitude, finalAltitude, cd, frontalArea, mass, thruster]);

  const stationKeeping = useMemo(() => {
    if (!services.includes("stationKeeping")) return null;
    const density = interpolateDensity(skAltitude);
    const thrustReq = 0.5 * density * Math.pow(ORBITAL_VELOCITY, 2) * cd * frontalArea;
    const totalImpulse = thrustReq * (duration * 365.25 * 24 * 3600);
    return { thrustReq, totalImpulse, propMass: totalImpulse / ionVelocity, powerReq: thrustReq / THRUSTERS[thruster].tp };
  }, [services, skAltitude, duration, cd, frontalArea, ionVelocity, thruster]);

  const deorbit = useMemo(() => {
    if (!services.includes("deorbiting")) return null;
    const density = interpolateDensity(deorbitAltitude);
    const r1 = EARTH_RADIUS + deorbitAltitude * 1000;
    const dragAcc = 0.5 * (cd * frontalArea / mass) * density * Math.pow(ORBITAL_VELOCITY, 2);
    const r2 = EARTH_RADIUS + 100000;
    const aTransfer = (r1 + r2) / 2;
    const baseline = Math.abs(Math.sqrt(MU / r1) * (1 - Math.sqrt((2 * r2) / (r1 + r2))));
    const transferTime = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / MU);
    const dragDeltaV = (Math.abs(dragAcc) * transferTime * ORBITAL_VELOCITY) / (2 * r1);
    return { ballisticCoeff: mass / (cd * frontalArea), totalDeltaV: Math.max(0, baseline - dragDeltaV), dragAcc };
  }, [services, deorbitAltitude, cd, frontalArea, mass]);

  return (
    <div className="min-h-screen bg-[#0a0f14] text-slate-200 font-sans p-4 md:p-8">
      <div className="mx-auto max-w-7xl grid lg:grid-cols-[360px_1fr] gap-8">
        <aside className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl h-fit space-y-6 shadow-2xl backdrop-blur-xl">
          <h1 className="text-3xl font-black italic text-white">JivaJet <span className="text-cyan-400 not-italic font-light">Mission</span></h1>
          
          <div className="space-y-4">
            <SelectGroup label="Platform" value={platform} onChange={(val: string) => { setPlatform(val); setIsOverride(false); }} options={["3U", "6U", "12U", "24U", "Custom"]} />
            
            <div className="relative group">
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest flex justify-between">
                Frontal Area (m²)
                <button onClick={() => setIsOverride(!isOverride)} className={`text-[9px] px-2 rounded ${isOverride ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400'}`}>
                  {isOverride ? "OVERRIDE ACTIVE" : "AUTO"}
                </button>
              </label>
              <input type="number" value={frontalArea} onChange={(e) => { setFrontalArea(Number(e.target.value)); setIsOverride(true); }} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white focus:border-cyan-500/50 outline-none" />
            </div>

            <InputGroup label="Mass" unit="kg" value={mass} onChange={setMass} />
            <InputGroup label="Drag Coeff" unit="Cd" value={cd} onChange={setCd} step={0.1} />
            <SelectGroup label="Thruster" value={thruster} onChange={setThruster} options={["EMCAT", "EMCAT MPD", "JJDrive"]} />
            
            <div className="pt-4 border-t border-slate-800 space-y-2">
              {(["orbitRaising", "stationKeeping", "deorbiting"] as Service[]).map((s) => (
                <button key={s} onClick={() => setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-sm capitalize ${services.includes(s) ? 'border-cyan-500/50 bg-cyan-500/10 text-white' : 'border-slate-800 text-slate-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${services.includes(s) ? 'bg-cyan-400' : 'bg-slate-700'}`} /> {s.replace(/([A-Z])/g, ' $1')}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-8">
          {/* ORBIT RAISING SECTION */}
          {orbitRaising && (
            <section className="bg-slate-900/30 border border-cyan-500/20 rounded-3xl p-8 backdrop-blur-md">
              <h2 className="text-2xl font-black text-cyan-400 mb-8 italic">Orbit Raising</h2>
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <InputGroup label="Initial Alt" unit="km" value={initialAltitude} onChange={setInitialAltitude} />
                <InputGroup label="Final Alt" unit="km" value={finalAltitude} onChange={setFinalAltitude} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <ResultCard title="Total Delta V" value={orbitRaising.totalDeltaV.toFixed(2)} unit="m/s" />
                <ResultCard title="Drag Correction ΔV" value={orbitRaising.dragDeltaV.toFixed(4)} unit="m/s" />
                <ResultCard title="Time to Raise" value={(orbitRaising.transferTime / 60).toFixed(1)} unit="min" />
                <ResultCard title="Decay Rate" value={orbitRaising.semiMajorDecay.toExponential(3)} unit="m/s" />
              </div>
            </section>
          )}

          {/* STATION KEEPING SECTION */}
          {stationKeeping && (
            <section className="bg-slate-900/30 border border-emerald-500/20 rounded-3xl p-8 backdrop-blur-md">
              <h2 className="text-2xl font-black text-emerald-400 mb-8 italic">Orbit Maintenance</h2>
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <InputGroup label="Orbit Altitude" unit="km" value={skAltitude} onChange={setSkAltitude} />
                <InputGroup label="Duration" unit="Years" value={duration} onChange={setDuration} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <ResultCard title="Thrust Required" value={stationKeeping.thrustReq.toExponential(3)} unit="N" color="text-emerald-400" />
                <ResultCard title="Total Impulse" value={stationKeeping.totalImpulse.toExponential(2)} unit="N·s" color="text-emerald-400" />
                <ResultCard title="Propellant Mass" value={stationKeeping.propMass.toFixed(5)} unit="kg" color="text-emerald-400" />
                <ResultCard title="Power Required" value={stationKeeping.powerReq.toFixed(2)} unit="W" color="text-emerald-400" />
              </div>
            </section>
          )}

          {/* DEORBIT SECTION */}
          {deorbit && (
            <section className="bg-slate-900/30 border border-rose-500/20 rounded-3xl p-8 backdrop-blur-md">
              <h2 className="text-2xl font-black text-rose-400 mb-8 italic">Deorbiting</h2>
              <div className="max-w-xs mb-8">
                <InputGroup label="Start Deorbit Alt" unit="km" value={deorbitAltitude} onChange={setDeorbitAltitude} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <ResultCard title="Ballistic Coefficient" value={deorbit.ballisticCoeff.toFixed(2)} unit="kg/m²" color="text-rose-400" />
                <ResultCard title="Required Delta V" value={deorbit.totalDeltaV.toFixed(2)} unit="m/s" color="text-rose-400" />
                <ResultCard title="Drag Acceleration" value={deorbit.dragAcc.toExponential(3)} unit="m/s²" color="text-rose-400" />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function InputGroup({ label, unit, value, onChange, ...props }: any) {
  return (
    <div className="flex-1">
      <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{label} ({unit})</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white focus:border-cyan-500/50 outline-none transition-all" {...props} />
    </div>
  );
}

function SelectGroup({ label, value, onChange, options }: any) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white outline-none appearance-none cursor-pointer">
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ResultCard({ title, value, unit, color = "text-cyan-400" }: any) {
  return (
    <div className="bg-slate-900/40 border border-slate-800/60 p-6 rounded-3xl">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold tracking-tight ${color}`}>{value}</span>
        <span className={`text-sm font-bold opacity-80 ${color}`}>{unit}</span>
      </div>
    </div>
  );
}
