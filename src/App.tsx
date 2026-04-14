import React, { useMemo, useState, useEffect } from "react";

type Service = "orbitRaising" | "stationKeeping" | "deorbiting";
type Thruster = "EMCAT" | "EMCAT MPD" | "JJDrive";

const EARTH_RADIUS = 6371e3;
const MU = 3.986004418e14;
const ORBITAL_VELOCITY = 7800;

const PLATFORM_AREAS: Record<string, number> = {
  "3U": 0.01, "6U": 0.03, "12U": 0.06, "24U": 0.12,
};

const THRUSTERS: Record<Thruster, { tp: number }> = {
  "EMCAT": { tp: 10e-6 },
  "EMCAT MPD": { tp: 44e-6 },
  "JJDrive": { tp: 100e-6 },
};

const DENSITY_TABLE: Record<number, number> = {
  0: 1.23, 5: 0.736, 10: 0.414, 15: 0.195, 20: 0.0889, 25: 0.0401, 30: 0.0184, 35: 0.00846, 40: 0.004, 45: 0.00197,
  50: 0.00103, 55: 0.000568, 60: 0.00031, 65: 0.000163, 70: 8.28e-5, 75: 3.99e-5, 80: 1.85e-5, 85: 8.22e-6, 90: 3.44e-6, 95: 1.39e-6,
  100: 5.60e-7, 105: 2.33e-7, 110: 9.67e-8, 115: 4.28e-8, 120: 2.22e-8, 125: 1.29e-8, 130: 8.15e-9, 135: 5.46e-9, 140: 3.83e-9, 145: 2.78e-9,
  150: 2.08e-9, 155: 1.58e-9, 160: 1.23e-9, 165: 9.75e-10, 170: 7.82e-10, 175: 6.34e-10, 180: 5.19e-10, 185: 4.30e-10, 190: 3.58e-10, 195: 3.01e-10,
  200: 2.54e-10, 205: 2.16e-10, 210: 1.85e-10, 215: 1.58e-10, 220: 1.37e-10, 225: 1.18e-10, 230: 1.03e-10, 235: 8.98e-11, 240: 7.86e-11, 245: 6.90e-11,
  250: 6.07e-11, 255: 5.36e-11, 260: 4.74e-11, 265: 4.21e-11, 270: 3.74e-11, 275: 3.33e-11, 280: 2.97e-11, 285: 2.66e-11, 290: 2.38e-11, 295: 2.13e-11,
  300: 1.92e-11, 305: 1.72e-11, 310: 1.55e-11, 315: 1.40e-11, 320: 1.26e-11, 325: 1.14e-11, 330: 1.03e-11, 335: 9.36e-12, 340: 8.49e-12, 345: 7.71e-12,
  350: 7.00e-12, 355: 6.37e-12, 360: 5.80e-12, 365: 5.28e-12, 370: 4.81e-12, 375: 4.39e-12, 380: 4.01e-12, 385: 3.66e-12, 390: 3.35e-12, 395: 3.06e-12,
  400: 2.80e-12, 405: 2.57e-12, 410: 2.35e-12, 415: 2.15e-12, 420: 1.98e-12, 425: 1.81e-12, 430: 1.66e-12, 435: 1.53e-12, 440: 1.40e-12, 445: 1.29e-12,
  450: 1.18e-12, 455: 1.09e-12, 460: 1.00e-12, 465: 9.22e-13, 470: 8.49e-13, 475: 7.82e-13, 480: 7.21e-13, 485: 6.64e-13, 490: 6.13e-13, 495: 5.65e-13,
  500: 5.21e-13, 505: 4.81e-13, 510: 4.45e-13, 515: 4.11e-13, 520: 3.79e-13, 525: 3.51e-13, 530: 3.24e-13, 535: 3.00e-13, 540: 2.78e-13, 545: 2.57e-13,
  550: 2.38e-13, 555: 2.21e-13, 560: 2.05e-13, 565: 1.90e-13, 570: 1.76e-13, 575: 1.64e-13, 580: 1.52e-13, 585: 1.41e-13, 590: 1.31e-13, 595: 1.22e-13,
  600: 1.14e-13
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

  const [email, setEmail] = useState("");

  const handleSendEmail = () => {
    if (!email) {
      alert("Please enter an email address.");
      return;
    }
    alert(`Results sent to ${email}!`);
    setEmail("");
  };

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
    const densityInitial = interpolateDensity(initialAltitude);
    const dragAcceleration = 0.5 * (cd * frontalArea / mass) * densityInitial * Math.pow(ORBITAL_VELOCITY, 2);
    const semiMajorDecay = (-2 * Math.pow(aTransfer, 1.5) * dragAcceleration) / Math.sqrt(MU);
    const transferTime = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / MU);
    const dragDeltaV = (Math.abs(semiMajorDecay) * transferTime * ORBITAL_VELOCITY) / (2 * r1);
    const thrustRequired = 0.5 * densityInitial * Math.pow(ORBITAL_VELOCITY, 2) * cd * frontalArea;

    return { 
      totalDeltaV: baseline + dragDeltaV, 
      dragDeltaV, 
      transferTime, 
      thrustRequired, 
      powerRequired: thrustRequired / THRUSTERS[thruster].tp, 
      totalImpulse: mass * (baseline + dragDeltaV), 
      semiMajorDecay 
    };
  }, [services, initialAltitude, finalAltitude, cd, frontalArea, mass, thruster]);

  const stationKeeping = useMemo(() => {
    if (!services.includes("stationKeeping")) return null;
    const density = interpolateDensity(skAltitude);
    const thrustReq = 0.5 * density * Math.pow(ORBITAL_VELOCITY, 2) * cd * frontalArea;
    const totalImpulse = thrustReq * (duration * 365.25 * 24 * 3600);
    return { 
      thrustReq, totalImpulse, propMass: totalImpulse / ionVelocity, 
      powerReq: thrustReq / THRUSTERS[thruster].tp, density
    };
  }, [services, skAltitude, duration, cd, frontalArea, ionVelocity, thruster]);

  const deorbit = useMemo(() => {
    if (!services.includes("deorbiting")) return null;
    const density = interpolateDensity(deorbitAltitude);
    const r1 = EARTH_RADIUS + deorbitAltitude * 1000, r2 = EARTH_RADIUS + 100000;
    const aTransfer = (r1 + r2) / 2;
    const dragAcc = 0.5 * (cd * frontalArea / mass) * density * Math.pow(ORBITAL_VELOCITY, 2);
    
    // Decay Rate logic for Deorbiting
    const semiMajorDecay = (-2 * Math.pow(aTransfer, 1.5) * dragAcc) / Math.sqrt(MU);
    
    const baseline = Math.abs(Math.sqrt(MU / r1) * (1 - Math.sqrt((2 * r2) / (r1 + r2))));
    const transferTime = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / MU);
    const dragDeltaV = (Math.abs(dragAcc) * transferTime * ORBITAL_VELOCITY) / (2 * r1);
    
    return { 
      ballisticCoeff: mass / (cd * frontalArea), 
      totalDeltaV: Math.max(0, baseline - dragDeltaV), 
      semiMajorDecay,
      dragForce: 0.5 * density * Math.pow(ORBITAL_VELOCITY, 2) * cd * frontalArea
    };
  }, [services, deorbitAltitude, cd, frontalArea, mass]);

  return (
    <div className="min-h-screen bg-[#0a0f14] text-slate-200 p-4 md:p-8 selection:bg-cyan-500/30">
      <div className="mx-auto max-w-7xl grid lg:grid-cols-[360px_1fr] gap-8">
        <aside className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl h-fit space-y-6 shadow-2xl backdrop-blur-xl">
          <h1 className="text-3xl font-black italic text-white underline decoration-cyan-500/30">JivaJet Mission</h1>
          <div className="space-y-4">
            <SelectGroup label="Platform" value={platform} onChange={(val: string) => { setPlatform(val); setIsOverride(false); }} options={["3U", "6U", "12U", "24U", "Custom"]} />
            <InputGroup label="Frontal Area" unit="m²" value={frontalArea} onChange={(val: number) => { setFrontalArea(val); setIsOverride(true); }} />
            <InputGroup label="Mass" unit="kg" value={mass} onChange={setMass} />
            <InputGroup label="Drag Coeff" unit="Cd" value={cd} onChange={setCd} step={0.1} />
            <SelectGroup label="Thruster" value={thruster} onChange={setThruster} options={["EMCAT", "EMCAT MPD", "JJDrive"]} />
            
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Services</p>
              {(["orbitRaising", "stationKeeping", "deorbiting"] as Service[]).map((s) => (
                <button key={s} onClick={() => setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-sm capitalize transition-all ${services.includes(s) ? 'border-cyan-500/50 bg-cyan-500/10 text-white shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-slate-800 text-slate-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${services.includes(s) ? 'bg-cyan-400 shadow-[0_0_8px_cyan]' : 'bg-slate-700'}`} /> {s.replace(/([A-Z])/g, ' $1')}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-8">
          {orbitRaising && (
            <SectionFrame title="Orbit Raising" color="text-cyan-400" borderColor="border-cyan-500/20">
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <InputGroup label="Initial Alt" unit="km" value={initialAltitude} onChange={setInitialAltitude} />
                <InputGroup label="Final Alt" unit="km" value={finalAltitude} onChange={setFinalAltitude} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <ResultCard title="Total Delta V" value={orbitRaising.totalDeltaV.toFixed(2)} unit="m/s" color="text-cyan-400" />
                <ResultCard title="Drag Correction ΔV" value={orbitRaising.dragDeltaV.toFixed(4)} unit="m/s" color="text-cyan-400" />
                <ResultCard title="Raise Time" value={(orbitRaising.transferTime / 60).toFixed(1)} unit="min" color="text-cyan-400" />
                <ResultCard title="Thrust Required" value={formatScientific(orbitRaising.thrustRequired, 3)} unit="N" color="text-cyan-400" />
                <ResultCard title="Power Required" value={orbitRaising.powerRequired.toFixed(2)} unit="W" color="text-cyan-400" />
                <ResultCard title="Total Impulse" value={orbitRaising.totalImpulse.toFixed(2)} unit="N·s" color="text-cyan-400" />
                <ResultCard title="Decay Rate" value={formatScientific(orbitRaising.semiMajorDecay, 3)} unit="m/s" color="text-cyan-400" />
                <ResultCard title="Power Margin" value={(powerAvailable - orbitRaising.powerRequired).toFixed(2)} unit="W" color="text-cyan-400" />
              </div>
            </SectionFrame>
          )}

          {stationKeeping && (
            <SectionFrame title="Orbit Maintenance" color="text-emerald-400" borderColor="border-emerald-500/20">
              <div className="grid md:grid-cols-3 gap-4 mb-8">
                <InputGroup label="Target Alt" unit="km" value={skAltitude} onChange={setSkAltitude} />
                <InputGroup label="Life" unit="Years" value={duration} onChange={setDuration} />
                <InputGroup label="Ion Velocity" unit="m/s" value={ionVelocity} onChange={setIonVelocity} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <ResultCard title="Continuous Thrust" value={formatScientific(stationKeeping.thrustReq, 3)} unit="N" color="text-emerald-400" />
                <ResultCard title="Maintenance Power" value={stationKeeping.powerReq.toFixed(2)} unit="W" color="text-emerald-400" />
                <ResultCard title="Mission Impulse" value={formatScientific(stationKeeping.totalImpulse, 2)} unit="N·s" color="text-emerald-400" />
                <ResultCard title="Propellant Mass" value={stationKeeping.propMass.toFixed(5)} unit="kg" color="text-emerald-400" />
                <ResultCard title="Local Air Density" value={formatScientific(stationKeeping.density, 3)} unit="kg/m³" color="text-emerald-400" />
                <ResultCard title="Power Margin" value={(powerAvailable - stationKeeping.powerReq).toFixed(2)} unit="W" color="text-emerald-400" />
              </div>
            </SectionFrame>
          )}

          {deorbit && (
            <SectionFrame title="Deorbiting" color="text-rose-400" borderColor="border-rose-500/20">
              <div className="max-w-xs mb-8">
                <InputGroup label="Deorbit Start Alt" unit="km" value={deorbitAltitude} onChange={setDeorbitAltitude} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <ResultCard title="Ballistic Coefficient" value={deorbit.ballisticCoeff.toFixed(2)} unit="kg/m²" color="text-rose-400" />
                <ResultCard title="Deorbit Delta V" value={deorbit.totalDeltaV.toFixed(2)} unit="m/s" color="text-rose-400" />
                <ResultCard title="Initial Drag Force" value={formatScientific(deorbit.dragForce, 3)} unit="N" color="text-rose-400" />
                <ResultCard title="Initial Decay Rate" value={formatScientific(deorbit.semiMajorDecay, 3)} unit="m/s" color="text-rose-400" />
              </div>
            </SectionFrame>
          )}

          <SectionFrame title="Send Results" color="text-violet-400" borderColor="border-violet-500/20">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full group">
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Email Address</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="name@example.com"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white focus:border-violet-500/50 outline-none transition-all placeholder:text-slate-700" 
                />
              </div>
              <button 
                onClick={handleSendEmail}
                className="w-full md:w-auto h-[54px] px-8 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 border border-violet-500/50 rounded-xl font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(139,92,246,0.1)] hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]"
              >
                Send
              </button>
            </div>
          </SectionFrame>
        </main>
      </div>
    </div>
  );
}

function formatScientific(value: number, fractionDigits: number = 3) {
  if (value === 0) return "0";
  const str = value.toExponential(fractionDigits);
  const [base, exponent] = str.split("e");
  const expNum = parseInt(exponent, 10);
  
  if (expNum === 0) return base;
  
  return (
    <span>
      {base} &times; 10<sup>{expNum}</sup>
    </span>
  );
}

function SectionFrame({ title, children, color, borderColor }: any) {
  return (
    <section className={`bg-slate-900/30 border ${borderColor} rounded-3xl p-8 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-700`}>
      <h2 className={`text-2xl font-black mb-8 italic ${color}`}>{title}</h2>
      {children}
    </section>
  );
}

function InputGroup({ label, unit, value, onChange, ...props }: any) {
  return (
    <div className="flex-1 group">
      <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{label} ({unit})</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white focus:border-cyan-500/50 outline-none transition-all placeholder:text-slate-700" {...props} />
    </div>
  );
}

function SelectGroup({ label, value, onChange, options }: any) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white outline-none appearance-none cursor-pointer hover:border-slate-700 transition-colors">
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ResultCard({ title, value, unit, color }: any) {
  return (
    <div className="bg-slate-900/40 border border-slate-800/60 p-6 rounded-3xl transition-transform hover:scale-[1.02] duration-300">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold tracking-tight ${color}`}>{value}</span>
        <span className={`text-sm font-bold opacity-70 ${color}`}>{unit}</span>
      </div>
    </div>
  );
}
