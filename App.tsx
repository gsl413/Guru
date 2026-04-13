import React, { useMemo, useState } from "react";

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
  const [customArea, setCustomArea] = useState(0.03);
  const [frontalArea, setFrontalArea] = useState(0.03);
  const [mass, setMass] = useState(12);
  const [cd, setCd] = useState(2.2);
  const [powerAvailable, setPowerAvailable] = useState(100);
  const [thruster, setThruster] = useState<Thruster>("EMCAT MPD");
  const [initialAltitude, setInitialAltitude] = useState(300);
  const [finalAltitude, setFinalAltitude] = useState(500);
  const [orbitAltitude, setOrbitAltitude] = useState(300);
  const [duration, setDuration] = useState(1);
  const [ionVelocity, setIonVelocity] = useState(20000);
  const [deorbitAltitude, setDeorbitAltitude] = useState(500);

  const area = platform === "Custom" ? customArea : frontalArea || PLATFORM_AREAS[platform];

  const toggleService = (service: Service) => {
    setServices((prev) => prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]);
  };

  const orbitRaising = useMemo(() => {
    if (!services.includes("orbitRaising")) return null;
    const r1 = EARTH_RADIUS + initialAltitude * 1000, r2 = EARTH_RADIUS + finalAltitude * 1000;
    const aTransfer = (r1 + r2) / 2;
    const dv1 = Math.sqrt(MU / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
    const dv2 = Math.sqrt(MU / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
    const baseline = Math.abs(dv1) + Math.abs(dv2);
    const density = interpolateDensity(initialAltitude);
    const dragAcc = 0.5 * (cd * area / mass) * density * Math.pow(ORBITAL_VELOCITY, 2);
    const transferTime = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / MU);
    const dragDeltaV = (Math.abs((-2 * Math.pow(aTransfer, 1.5) * dragAcc) / Math.sqrt(MU)) * transferTime * ORBITAL_VELOCITY) / (2 * r1);
    const dragForce = 0.5 * density * Math.pow(ORBITAL_VELOCITY, 2) * cd * area;
    const power = dragForce / THRUSTERS[thruster].tp;
    return { deltaV: baseline + dragDeltaV, dragForce, power, powerMargin: powerAvailable - power, impulse: mass * (baseline + dragDeltaV), transferTime };
  }, [services, initialAltitude, finalAltitude, cd, area, mass, thruster, powerAvailable]);

  const stationKeeping = useMemo(() => {
    if (!services.includes("stationKeeping")) return null;
    const density = interpolateDensity(orbitAltitude);
    const thrust = 0.5 * density * Math.pow(ORBITAL_VELOCITY, 2) * cd * area;
    const seconds = duration * 365.25 * 24 * 3600;
    return { impulse: thrust * seconds, propellant: (thrust * seconds) / ionVelocity, thrust, power: thrust / THRUSTERS[thruster].tp };
  }, [services, orbitAltitude, duration, cd, area, ionVelocity, thruster]);

  const deorbit = useMemo(() => {
    if (!services.includes("deorbiting")) return null;
    const density = interpolateDensity(deorbitAltitude);
    const r1 = EARTH_RADIUS + deorbitAltitude * 1000;
    const dragAcc = 0.5 * (cd * area / mass) * density * Math.pow(ORBITAL_VELOCITY, 2);
    let deltaV = 0;
    if (deorbitAltitude > 100) {
      const r2 = EARTH_RADIUS + 100000, aTransfer = (r1 + r2) / 2;
      const baseline = Math.abs(Math.sqrt(MU / r1) * (1 - Math.sqrt((2 * r2) / (r1 + r2))));
      const transferTime = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / MU);
      const dragDeltaV = (Math.abs((-2 * Math.pow(aTransfer, 1.5) * dragAcc) / Math.sqrt(MU)) * transferTime * ORBITAL_VELOCITY) / (2 * r1);
      deltaV = Math.max(0, baseline - dragDeltaV);
    }
    return { deltaV, ballisticCoefficient: mass / (cd * area) };
  }, [services, deorbitAltitude, cd, area, mass]);

  return (
    <div className="min-h-screen bg-[#0a0f14] text-slate-200 font-sans p-4 md:p-8">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-500/5 blur-[120px] rounded-full animate-pulse" />
      </div>
      <div className="mx-auto max-w-7xl grid lg:grid-cols-[360px_1fr] gap-8">
        <aside className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl h-fit space-y-6 shadow-2xl">
          <header className="mb-8"><h1 className="text-3xl font-black italic text-white">JivaJet <span className="text-cyan-400 not-italic font-light">Mission</span></h1></header>
          <div className="space-y-4">
            <SelectGroup label="Platform" value={platform} onChange={setPlatform} options={["3U", "6U", "12U", "24U", "Custom"]} />
            {platform === "Custom" && <InputGroup label="Ref Area" unit="m²" value={customArea} onChange={setCustomArea} />}
            <InputGroup label="Frontal Area" unit="m²" value={frontalArea} onChange={setFrontalArea} /><InputGroup label="Mass" unit="kg" value={mass} onChange={setMass} />
            <InputGroup label="Drag Coeff" unit="Cd" value={cd} onChange={setCd} step={0.1} /><InputGroup label="Power Avail." unit="W" value={powerAvailable} onChange={setPowerAvailable} />
            <SelectGroup label="Thruster" value={thruster} onChange={setThruster} options={["EMCAT", "EMCAT MPD", "JJDrive"]} />
            <div className="pt-4 border-t border-slate-800 space-y-2">
              {(["orbitRaising", "stationKeeping", "deorbiting"] as Service[]).map((s) => (
                <button key={s} onClick={() => toggleService(s)} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-sm capitalize ${services.includes(s) ? 'border-cyan-500/50 bg-cyan-500/10 text-white' : 'border-slate-800 text-slate-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${services.includes(s) ? 'bg-cyan-400' : 'bg-slate-700'}`} /> {s.replace(/([A-Z])/g, ' $1')}
                </button>
              ))}
            </div>
          </div>
        </aside>
        <main className="space-y-6">
          {orbitRaising && <Section title="Orbit Raising" color="text-cyan-400" borderColor="border-cyan-500/20">
            <div className="grid md:grid-cols-2 gap-4 mb-8"><InputGroup label="Initial Alt" unit="km" value={initialAltitude} onChange={setInitialAltitude} /><InputGroup label="Final Alt" unit="km" value={finalAltitude} onChange={setFinalAltitude} /></div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <ResultCard title="Total ΔV" value={orbitRaising.deltaV.toFixed(2)} unit="m/s" /><ResultCard title="Drag Force" value={orbitRaising.dragForce.toExponential(2)} unit="N" />
              <ResultCard title="Power Req." value={orbitRaising.power.toFixed(1)} unit="W" /><ResultCard title="Raise Time" value={(orbitRaising.transferTime / 60).toFixed(1)} unit="min" />
            </div>
          </Section>}
          {stationKeeping && <Section title="Station Keeping" color="text-emerald-400" borderColor="border-emerald-500/20">
            <div className="grid md:grid-cols-3 gap-4 mb-8"><InputGroup label="Orbit Alt" unit="km" value={orbitAltitude} onChange={setOrbitAltitude} /><InputGroup label="Life" unit="Yrs" value={duration} onChange={setDuration} /><InputGroup label="Ion Vel." unit="m/s" value={ionVelocity} onChange={setIonVelocity} /></div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <ResultCard title="Total Impulse" value={stationKeeping.impulse.toExponential(2)} unit="N·s" /><ResultCard title="Propellant" value={stationKeeping.propellant.toFixed(4)} unit="kg" />
              <ResultCard title="Thrust Req." value={stationKeeping.thrust.toExponential(2)} unit="N" /><ResultCard title="Power Req." value={stationKeeping.power.toFixed(1)} unit="W" />
            </div>
          </Section>}
          {deorbit && <Section title="Deorbiting" color="text-rose-400" borderColor="border-rose-500/20">
            <div className="max-w-xs mb-8"><InputGroup label="Start Altitude" unit="km" value={deorbitAltitude} onChange={setDeorbitAltitude} /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <ResultCard title="Ballistic Coeff." value={deorbit.ballisticCoefficient.toFixed(2)} unit="kg/m²" /><ResultCard title="Required ΔV" value={deorbit.deltaV.toFixed(2)} unit="m/s" />
            </div>
          </Section>}
        </main>
      </div>
    </div>
  );
}

function Section({ title, children, color, borderColor }: any) {
  return <div className={`bg-slate-900/30 border ${borderColor} rounded-3xl p-8 backdrop-blur-md`}>
    <h2 className={`text-xl font-black uppercase tracking-widest mb-8 ${color}`}>{title}</h2>{children}
  </div>;
}

function InputGroup({ label, unit, value, onChange, ...props }: any) {
  return <div className="relative group"><label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{label}</label>
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-lg focus:border-cyan-500/50 outline-none transition-all" {...props} />
    <span className="absolute right-4 bottom-3.5 text-[10px] font-bold text-slate-700 uppercase">{unit}</span></div>;
}

function SelectGroup({ label, value, onChange, options }: any) {
  return <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-lg outline-none appearance-none">
      {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
    </select></div>;
}

function ResultCard({ title, value, unit }: any) {
  return <div className="bg-slate-950/50 border border-slate-800 p-5 rounded-2xl"><p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">{title}</p>
    <div className="flex items-baseline gap-2"><span className="text-xl font-mono text-white font-bold">{value}</span><span className="text-[9px] font-bold text-slate-500 uppercase">{unit}</span></div></div>;
}