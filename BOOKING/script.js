// ============================================================
// IMPORTS FROM FIREBASE-CONFIG
// ============================================================
import {
    db,
    auth,
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    onSnapshot,
    deleteDoc,
    updateDoc,
    addDoc,
    Timestamp,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from './firebase-config.js';

// Expose Firebase objects globally
window.db = db;
window.auth = auth;
window.collection = collection;
window.doc = doc;
window.setDoc = setDoc;
window.getDoc = getDoc;
window.getDocs = getDocs;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.serverTimestamp = serverTimestamp;
window.onSnapshot = onSnapshot;
window.deleteDoc = deleteDoc;
window.updateDoc = updateDoc;
window.addDoc = addDoc;
window.Timestamp = Timestamp;
window.signInWithEmailAndPassword = signInWithEmailAndPassword;
window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
window.onAuthStateChanged = onAuthStateChanged;
window.signOut = signOut;

// ============================================================
// GLOBALS
// ============================================================
let currentUser = null;
let allUsers = [];
let allDrivers = [];
let allRoutes = [];
let allBookings = [];
let allAdmins = [];
let mapInstance = null;
let mapMarker = null;
let routePolyline = null;
let busMarkers = {};
let simulationInterval = null;
let busIndex = 0;
let currentRouteId = null;
let simulationActive = false;
let locationWatchId = null;
let selectedCompanyId = null;
let selectedLoginRole = null;
let pendingActivationUser = null;

// ============================================================
// COOKIE HELPERS
// ============================================================
function setCookie(name, value, days = 30) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + "=" + encodeURIComponent(value) + ";path=/;expires=" + d.toUTCString();
}

function getCookie(name) {
    const c = document.cookie.split(';');
    for (let s of c) {
        const [k, v] = s.trim().split('=');
        if (k === name) return decodeURIComponent(v);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = name + "=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

// ============================================================
// HASHING (SHA-256)
// ============================================================
async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// IP ADDRESS
// ============================================================
async function getIPAddress() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        return data.ip;
    } catch (e) {
        console.warn('IP fetch failed:', e);
        return '0.0.0.0';
    }
}

// ============================================================
// AUTO-CREATE OWNER IF NOT EXISTS
// ============================================================
async function ensureOwnerExists() {
    try {
        const ownerRef = doc(db, 'users', 'owner');
        const ownerSnap = await getDoc(ownerRef);
        
        if (!ownerSnap.exists()) {
            console.log('🔑 Owner account not found. Creating default owner...');
            const defaultCode = 'owner123';
            const hashedPassword = await hashString(defaultCode);
            const ownerData = {
                username: 'owner',
                name: 'System Owner',
                password: hashedPassword,
                role: 'owner',
                isAdmin: false,
                isDriver: false,
                isOwner: true,
                activated: true,
                specialCode: defaultCode,
                ip: await getIPAddress(),
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            };
            await setDoc(ownerRef, ownerData);
            console.log(`✅ Owner created with code: ${defaultCode}`);
        } else {
            console.log('✅ Owner already exists.');
        }
    } catch (e) {
        console.error('Error ensuring owner exists:', e);
    }
}

// ============================================================
// AUTH FUNCTIONS
// ============================================================
async function performLogin(role, username, password, specialCode) {
    const errEl = document.getElementById('loginError');
    if (!role) { errEl.textContent = 'Please select a role.'; return; }

    if (role === 'user') {
        if (!username || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
        try {
            const q = query(collection(db, 'users'), where('username', '==', username), where('role', '==', 'user'));
            const snap = await getDocs(q);
            if (snap.empty) {
                errEl.textContent = 'User not found.';
                return;
            }
            const userDoc = snap.docs[0];
            const userData = userDoc.data();
            if (userData.password !== password) {
                errEl.textContent = 'Incorrect password.';
                return;
            }
            currentUser = {
                uid: userDoc.id,
                username: userData.username,
                role: 'user',
                name: userData.name || username,
                ip: userData.ip || '0.0.0.0',
                isAdmin: false,
                isDriver: false,
                isOwner: false,
                activated: true,
                ...userData
            };
            setCookie('session', JSON.stringify({ uid: userDoc.id, role: 'user' }), 30);
            window.location.href = 'book.html';
        } catch (e) {
            console.error(e);
            errEl.textContent = 'Login error: ' + e.message;
        }
    } else {
        if (!specialCode) { errEl.textContent = 'Please enter your access code.'; return; }
        try {
            const hashedInput = await hashString(specialCode);
            let fieldName, fieldValue;
            if (role === 'owner') {
                fieldName = 'isOwner';
                fieldValue = true;
            } else if (role === 'admin') {
                fieldName = 'isAdmin';
                fieldValue = true;
            } else if (role === 'driver') {
                fieldName = 'isDriver';
                fieldValue = true;
            } else {
                errEl.textContent = 'Invalid role.';
                return;
            }

            const q = query(collection(db, 'users'), where(fieldName, '==', fieldValue), where('password', '==', hashedInput));
            const snap = await getDocs(q);
            if (snap.empty) {
                errEl.textContent = 'Invalid access code.';
                return;
            }
            const userDoc = snap.docs[0];
            const userData = userDoc.data();

            if (userData.activated === false) {
                pendingActivationUser = {
                    uid: userDoc.id,
                    role: role,
                    data: userData
                };
                document.getElementById('loginFormContainer').style.display = 'none';
                document.getElementById('activationContainer').style.display = 'block';
                document.getElementById('activationMessage').textContent = 
                    `Welcome, ${userData.name || userData.username || 'User'}! Create your password.`;
                errEl.textContent = '';
                return;
            } else {
                currentUser = {
                    uid: userDoc.id,
                    username: userData.username || 'user',
                    role: role,
                    name: userData.name || userData.username || 'User',
                    ip: userData.ip || '0.0.0.0',
                    isAdmin: userData.isAdmin || false,
                    isDriver: userData.isDriver || false,
                    isOwner: userData.isOwner || false,
                    activated: true,
                    ...userData
                };
                setCookie('session', JSON.stringify({ uid: userDoc.id, role: role }), 30);
                if (role === 'owner') window.location.href = 'owner.html';
                else if (role === 'admin') window.location.href = 'admin.html';
                else if (role === 'driver') window.location.href = 'driver.html';
                else window.location.href = 'book.html';
            }
        } catch (e) {
            console.error(e);
            errEl.textContent = 'Login error: ' + e.message;
        }
    }
}

async function activateAccount() {
    const newPassword = document.getElementById('activationPassword').value.trim();
    const confirmPassword = document.getElementById('activationConfirm').value.trim();
    const errEl = document.getElementById('activationError');
    if (!newPassword || newPassword.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        return;
    }
    if (newPassword !== confirmPassword) {
        errEl.textContent = 'Passwords do not match.';
        return;
    }
    if (!pendingActivationUser) {
        errEl.textContent = 'Session expired. Please login again.';
        return;
    }
    try {
        const hashed = await hashString(newPassword);
        
        const userRef = doc(db, 'users', pendingActivationUser.uid);
        await updateDoc(userRef, {
            password: hashed,
            activated: true,
            lastLogin: serverTimestamp()
        });
        
        document.getElementById('activationForm').style.display = 'none';
        document.getElementById('activationSuccess').style.display = 'block';
        document.getElementById('activationSuccessMessage').textContent = 
            '✅ Account activated successfully! You can now login with your password.';
        
        setTimeout(async () => {
            const updatedSnap = await getDoc(userRef);
            const userData = updatedSnap.data();
            currentUser = {
                uid: pendingActivationUser.uid,
                username: userData.username || 'user',
                role: pendingActivationUser.role,
                name: userData.name || userData.username || 'User',
                ip: userData.ip || '0.0.0.0',
                isAdmin: userData.isAdmin || false,
                isDriver: userData.isDriver || false,
                isOwner: userData.isOwner || false,
                activated: true,
                ...userData
            };
            setCookie('session', JSON.stringify({ uid: pendingActivationUser.uid, role: pendingActivationUser.role }), 30);
            pendingActivationUser = null;
            const role = currentUser.role;
            if (role === 'owner') window.location.href = 'owner.html';
            else if (role === 'admin') window.location.href = 'admin.html';
            else if (role === 'driver') window.location.href = 'driver.html';
            else window.location.href = 'book.html';
        }, 2000);
        
    } catch (e) {
        console.error(e);
        errEl.textContent = 'Activation error: ' + e.message;
    }
}

async function logoutUser() {
    deleteCookie('session');
    currentUser = null;
    pendingActivationUser = null;
    window.location.href = 'index.html';
}

async function checkSession() {
    const sessionData = getCookie('session');
    if (!sessionData) {
        const protectedPages = ['book.html', 'track.html', 'admin.html', 'driver.html', 'owner.html'];
        const currentPage = window.location.pathname.split('/').pop();
        if (protectedPages.includes(currentPage)) {
            window.location.href = 'login.html';
        }
        return null;
    }
    try {
        const { uid, role } = JSON.parse(sessionData);
        const docSnap = await getDoc(doc(db, 'users', uid));
        if (!docSnap.exists()) {
            deleteCookie('session');
            window.location.href = 'login.html';
            return null;
        }
        const data = docSnap.data();
        if (role === 'user' && data.role !== 'user') {
            deleteCookie('session');
            window.location.href = 'login.html';
            return null;
        }
        if (role !== 'user') {
            if (role === 'owner' && !data.isOwner) { deleteCookie('session'); window.location.href = 'login.html'; return null; }
            if (role === 'admin' && !data.isAdmin) { deleteCookie('session'); window.location.href = 'login.html'; return null; }
            if (role === 'driver' && !data.isDriver) { deleteCookie('session'); window.location.href = 'login.html'; return null; }
        }
        currentUser = {
            uid: docSnap.id,
            username: data.username || 'user',
            role: role,
            name: data.name || data.username || 'User',
            ip: data.ip || '0.0.0.0',
            isAdmin: data.isAdmin || false,
            isDriver: data.isDriver || false,
            isOwner: data.isOwner || false,
            activated: data.activated || false,
            ...data
        };
        return currentUser;
    } catch (e) {
        console.warn('Session restore failed:', e);
        deleteCookie('session');
        window.location.href = 'login.html';
        return null;
    }
}

// ============================================================
// DATA REFRESH FUNCTIONS
// ============================================================
async function refreshAllData() {
    await refreshUsers();
    await refreshDrivers();
    await refreshRoutes();
    await refreshBookings();
    await refreshAdmins();
}

async function refreshUsers() {
    try {
        const snap = await getDocs(collection(db, 'users'));
        allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    } catch (e) { console.warn('Users refresh failed:', e); }
}

async function refreshDrivers() {
    try {
        const snap = await getDocs(collection(db, 'drivers'));
        allDrivers = snap.docs.map(d => ({ did: d.id, ...d.data() }));
    } catch (e) { console.warn('Drivers refresh failed:', e); }
}

async function refreshRoutes() {
    try {
        const snap = await getDocs(collection(db, 'routes'));
        allRoutes = snap.docs.map(d => ({ rid: d.id, ...d.data() }));
    } catch (e) { console.warn('Routes refresh failed:', e); }
}

async function refreshBookings() {
    try {
        const snap = await getDocs(collection(db, 'bookings'));
        allBookings = snap.docs.map(d => ({ bid: d.id, ...d.data() }));
        allBookings.sort((a, b) => {
            const ta = a.createdAt?.toDate?.() || new Date(0);
            const tb = b.createdAt?.toDate?.() || new Date(0);
            return tb - ta;
        });
    } catch (e) { console.warn('Bookings refresh failed:', e); }
}

async function refreshAdmins() {
    try {
        allAdmins = allUsers.filter(u => u.isAdmin === true);
    } catch (e) { console.warn('Admins refresh failed:', e); }
}

// ============================================================
// SEATS (local storage fallback)
// ============================================================
let seatData = JSON.parse(localStorage.getItem('seats')) || Array(12).fill(null);

function assignSeat(name) {
    const free = seatData.map((s, i) => s === null ? i : null).filter(i => i !== null);
    if (free.length === 0) return null;
    const chosen = free[Math.floor(Math.random() * free.length)];
    seatData[chosen] = name;
    localStorage.setItem('seats', JSON.stringify(seatData));
    return chosen + 1;
}

function renderSeats() {
    const grid = document.getElementById('seatGrid');
    if (!grid) return;
    grid.innerHTML = '';
    seatData.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'seat ' + (s ? 'taken' : 'free');
        div.textContent = i + 1;
        grid.appendChild(div);
    });
}

// ============================================================
// LOAD TRIPS
// ============================================================
function loadTrips() {
    const select = document.getElementById('pTrip');
    if (!select) return;
    select.innerHTML = '<option value="">— Select a trip —</option>';
    allDrivers.forEach(d => {
        const route = allRoutes.find(r => r.rid === d.routeId);
        if (route) {
            const opt = document.createElement('option');
            opt.value = d.did;
            opt.textContent = `${route.name} - ${d.busType?.toUpperCase() || 'STANDARD'} - ₱${d.fare || 0}`;
            opt.dataset.busType = d.busType || 'standard';
            opt.dataset.fare = d.fare || 0;
            opt.dataset.routeId = d.routeId;
            opt.dataset.departure = d.departureTime || '08:00';
            select.appendChild(opt);
        }
    });
}

// ============================================================
// TRACK MAP FUNCTIONS (UPDATED for object-based waypoints)
// ============================================================
function initTrackMap() {
    if (document.getElementById('map') && typeof L !== 'undefined') {
        if (!mapInstance) {
            const start = [10.3157, 123.8854];
            mapInstance = L.map('map').setView(start, 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(mapInstance);
            mapMarker = L.marker(start).addTo(mapInstance);
        }

        const sel = document.getElementById('trackRouteSelect');
        if (sel) {
            sel.innerHTML = '<option value="">— Select Route —</option>';
            allRoutes.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.rid;
                opt.textContent = r.name;
                sel.appendChild(opt);
            });
        }

        if (currentUser) {
            const myBooking = allBookings.find(b => b.passengerId === currentUser.uid && b.status !== 'Boarded');
            if (myBooking) {
                const route = allRoutes.find(r => r.rid === myBooking.routeId);
                if (route) {
                    document.getElementById('autoRouteName').textContent = route.name;
                    const driver = allDrivers.find(d => d.did === myBooking.driverId);
                    document.getElementById('autoDriverName').textContent = driver ? (driver.fullName || driver.username || 'Driver') : '—';
                    document.getElementById('autoDeparture').textContent = myBooking.departureTime || '08:00';
                    document.getElementById('autoArrival').textContent = myBooking.estimatedArrival || '—';
                    currentRouteId = route.rid;
                    if (route.waypoints && route.waypoints.length > 0) {
                        // Convert object-based waypoints to Leaflet array
                        const wps = route.waypoints.map(p => [p.lat, p.lng]);
                        mapInstance.setView(wps[0], 13);
                        mapMarker.setLatLng(wps[0]);
                        drawRouteOnMap(route);
                    }
                }
            }
        }

        if (window.db) listenToDriverLocations();

        if (simulationInterval) { clearInterval(simulationInterval);
            simulationInterval = null; }
        simulationInterval = setInterval(() => {
            if (!simulationActive || !currentRouteId) return;
            const route = allRoutes.find(r => r.rid === currentRouteId);
            if (!route || !route.waypoints || route.waypoints.length === 0) return;
            const path = route.waypoints.map(p => [p.lat, p.lng]);
            busIndex = (busIndex + 1) % path.length;
            if (mapMarker) mapMarker.setLatLng(path[busIndex]);
            updateETA();
        }, 3000);
    }
}

function drawRouteOnMap(route) {
    if (!mapInstance || !route || !route.waypoints) return;
    if (routePolyline) mapInstance.removeLayer(routePolyline);
    const points = route.waypoints.map(p => [p.lat, p.lng]);
    routePolyline = L.polyline(points, { color: '#4a6cf7', weight: 4, opacity: 0.8 }).addTo(mapInstance);
    mapInstance.fitBounds(routePolyline.getBounds());
}

function startTracking() {
    const sel = document.getElementById('trackRouteSelect');
    const routeId = sel.value;
    if (!routeId) { alert('Please select a route.'); return; }
    const route = allRoutes.find(r => r.rid === routeId);
    if (!route || !route.waypoints) { alert('Route has no waypoints.'); return; }
    currentRouteId = routeId;
    simulationActive = true;
    busIndex = 0;
    if (mapMarker) {
        const start = route.waypoints[0];
        mapMarker.setLatLng([start.lat, start.lng]);
    }
    drawRouteOnMap(route);
    updateETA();
}

function updateETA() {
    const etaEl = document.getElementById('etaText');
    const etaTrack = document.getElementById('etaTextTrack');
    if (!currentRouteId) {
        const msg = 'Arrival: — minutes';
        if (etaEl) etaEl.textContent = msg;
        if (etaTrack) etaTrack.innerHTML = '<i class="fas fa-clock"></i> ' + msg;
        return;
    }
    const route = allRoutes.find(r => r.rid === currentRouteId);
    if (!route || !route.waypoints) {
        const msg = 'Arrival: — minutes';
        if (etaEl) etaEl.textContent = msg;
        if (etaTrack) etaTrack.innerHTML = '<i class="fas fa-clock"></i> ' + msg;
        return;
    }
    const remaining = route.waypoints.length - busIndex - 1;
    const eta = Math.max(0, remaining * 3);
    const msg = `Arrival: ${eta} minutes`;
    if (etaEl) etaEl.textContent = msg;
    if (etaTrack) etaTrack.innerHTML = '<i class="fas fa-clock"></i> ' + msg;
}

function listenToDriverLocations() {
    if (!window.db || !window.collection || !window.onSnapshot) return;
    window.onSnapshot(window.collection(window.db, 'driverLocations'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const username = change.doc.id;
            const latlng = [data.lat, data.lng];
            if (change.type === 'added' || change.type === 'modified') {
                if (busMarkers[username]) {
                    busMarkers[username].setLatLng(latlng);
                } else if (mapInstance) {
                    const m = L.marker(latlng).addTo(mapInstance);
                    m.bindPopup(
                        `<b>Driver:</b> ${username}<br><b>Bus:</b> ${data.busPlate || 'N/A'}`
                        );
                    busMarkers[username] = m;
                }
            } else if (change.type === 'removed') {
                if (busMarkers[username] && mapInstance) {
                    mapInstance.removeLayer(busMarkers[username]);
                    delete busMarkers[username];
                }
            }
        });
    });
}

// ============================================================
// HELPER: Generate random code
// ============================================================
function generateCode() {
    return 'CODE' + Math.floor(100000 + Math.random() * 900000);
}

// ============================================================
// HELPER: DMS to Decimal
// ============================================================
function dmsToDecimal(dmsStr) {
    const regex = /(\d+)[°\s](\d+)['\s](\d+(?:\.\d+)?)["]?\s*([NSEW])/gi;
    let match;
    let lat = null,
        lon = null;
    while ((match = regex.exec(dmsStr)) !== null) {
        const deg = parseFloat(match[1]);
        const min = parseFloat(match[2]);
        const sec = parseFloat(match[3]);
        const dir = match[4].toUpperCase();
        let decimal = deg + min / 60 + sec / 3600;
        if (dir === 'S' || dir === 'W') decimal = -decimal;
        if (dir === 'N' || dir === 'S') lat = decimal;
        else if (dir === 'E' || dir === 'W') lon = decimal;
    }
    if (lat === null || lon === null) throw new Error('Invalid DMS format');
    return [lat, lon];
}

// ============================================================
// HELPER: Fetch road route (returns array of {lat, lng} objects)
// ============================================================
async function fetchRoadRoute(startLat, startLng, endLat, endLng) {
    const url =
        `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route');
        // Convert GeoJSON coordinates to {lat, lng} objects
        const coords = data.routes[0].geometry.coordinates.map(pair => ({ lat: pair[1], lng: pair[0] }));
        return coords;
    } catch (e) {
        console.warn('Routing fallback to straight line');
        const points = [];
        for (let i = 0; i <= 20; i++) {
            const lat = startLat + (endLat - startLat) * (i / 20);
            const lng = startLng + (endLng - startLng) * (i / 20);
            points.push({ lat, lng });
        }
        return points;
    }
}

// ============================================================
// PAGE-SPECIFIC LOGIC
// ============================================================

// ===== LOGIN PAGE =====
function initLogin() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('signup') === 'true') {
        document.getElementById('loginFormContainer').style.display = 'none';
        document.getElementById('signupContainer').style.display = 'block';
    }
    checkSession().then(user => {
        if (user) {
            window.location.href = 'index.html';
        }
    });

    document.querySelectorAll('.login-role-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const role = this.dataset.role;
            selectLoginRole(role);
        });
    });
    document.getElementById('loginBtn')?.addEventListener('click', submitLogin);
    document.getElementById('signupBtn')?.addEventListener('click', submitSignup);
    document.getElementById('activateBtn')?.addEventListener('click', activateAccount);
}

function selectLoginRole(role) {
    selectedLoginRole = role;
    document.querySelectorAll('.login-role-btn').forEach(b => b.classList.toggle('selected', b.dataset.role === role));
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.textContent = '';
    if (role === 'user') {
        document.getElementById('userFields').style.display = 'block';
        document.getElementById('codeFields').style.display = 'none';
        document.getElementById('activationContainer').style.display = 'none';
        document.getElementById('signupLink').style.display = 'block';
    } else {
        document.getElementById('userFields').style.display = 'none';
        document.getElementById('codeFields').style.display = 'block';
        document.getElementById('activationContainer').style.display = 'none';
        document.getElementById('signupLink').style.display = 'none';
    }
    document.getElementById('loginFormContainer').style.display = 'block';
}

function submitLogin() {
    if (!selectedLoginRole) {
        document.getElementById('loginError').textContent = 'Please select a role.';
        return;
    }
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const code = document.getElementById('loginCode').value.trim();
    performLogin(selectedLoginRole, username, password, code);
}

async function submitSignup() {
    const name = document.getElementById('signupName').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const password = document.getElementById('signupPassword').value.trim();
    const errEl = document.getElementById('signupError');
    if (!name || !username || !password) {
        errEl.textContent = 'Please fill in all fields.';
        return;
    }
    try {
        const q = query(collection(db, 'users'), where('username', '==', username));
        const snap = await getDocs(q);
        if (!snap.empty) {
            errEl.textContent = 'Username already taken.';
            return;
        }
        const ip = await getIPAddress();
        const userData = {
            username,
            password,
            role: 'user',
            name,
            ip,
            isAdmin: false,
            isDriver: false,
            isOwner: false,
            activated: true,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
        };
        await addDoc(collection(db, 'users'), userData);
        alert('Account created! Please login.');
        window.location.href = 'login.html';
    } catch (e) {
        console.error(e);
        errEl.textContent = 'Signup error: ' + e.message;
    }
}

// ===== BOOK PAGE =====
function initBook() {
    checkSession().then(user => {
        if (!user) { window.location.href = 'login.html'; return; }
        updateBadge();
        refreshAllData().then(() => {
            loadTrips();
            setupBookingForm();
            const params = new URLSearchParams(window.location.search);
            const driverId = params.get('driver');
            if (driverId) {
                const select = document.getElementById('pTrip');
                select.value = driverId;
                select.dispatchEvent(new Event('change'));
            }
        });
    });
}

function setupBookingForm() {
    const tripSelect = document.getElementById('pTrip');
    tripSelect.addEventListener('change', function() {
        const sel = this.selectedOptions[0];
        if (sel && sel.value) {
            document.getElementById('selectedBusType').textContent = (sel.dataset.busType || 'STANDARD').toUpperCase();
            document.getElementById('selectedFare').textContent = sel.dataset.fare || '0';
        } else {
            document.getElementById('selectedBusType').textContent = '—';
            document.getElementById('selectedFare').textContent = '—';
        }
    });

    const form = document.getElementById('bookingForm');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('pName').value.trim();
        const driverId = document.getElementById('pTrip').value;
        if (!name) { alert('Please enter your name.'); return; }
        if (!driverId) { alert('Please select a trip.'); return; }

        const driver = allDrivers.find(d => d.did === driverId);
        if (!driver) { alert('Driver not found.'); return; }
        const route = allRoutes.find(r => r.rid === driver.routeId);
        if (!route) { alert('Route not found.'); return; }

        const seatNum = assignSeat(name);
        if (seatNum === null) { alert('No seats available!'); return; }

        const otp = Math.floor(1000 + Math.random() * 9000);

        const bookingData = {
            passengerName: name,
            passengerId: currentUser?.uid || 'guest',
            driverId: driver.did,
            driverName: driver.fullName || driver.username || 'driver',
            routeId: route.rid,
            routeName: route.name,
            busType: driver.busType || 'standard',
            fare: driver.fare || 0,
            seatNumber: seatNum,
            otp: otp,
            status: 'Pending',
            createdAt: serverTimestamp(),
            departureTime: driver.departureTime || '08:00',
            estimatedArrival: '—'
        };

        const docRef = await addDoc(collection(db, 'bookings'), bookingData);
        const newBooking = { bid: docRef.id, ...bookingData };
        allBookings.unshift(newBooking);

        document.getElementById('bookingForm').classList.add('hidden');
        document.getElementById('confirmation').classList.remove('hidden');
        document.getElementById('confirmText').innerHTML = `
            <strong>Passenger:</strong> ${name}<br>
            <strong>Route:</strong> ${route.name}<br>
            <strong>Bus Type:</strong> ${(driver.busType || 'STANDARD').toUpperCase()}<br>
            <strong>Fare:</strong> ₱${driver.fare || 0}<br>
            <strong>Seat:</strong> ${seatNum}<br>
            <strong>OTP:</strong> ${otp}<br>
            <strong>Departure:</strong> ${driver.departureTime || '08:00'}
        `;
        renderSeats();

        const driverInfoEl = document.getElementById('driverInfo');
        if (driverInfoEl) {
            driverInfoEl.innerHTML =
                `Driver: ${driver.fullName || driver.username || 'N/A'}<br>Bus: ${driver.plate || 'N/A'}<br>Route: ${route.name}<br>Conductor: ${driver.conductor || 'N/A'}`;
        }

        updateETA();
        refreshAllData();
    });
}

// ===== TRACK PAGE =====
function initTrack() {
    checkSession().then(user => {
        updateBadge();
        refreshAllData().then(() => {
            setTimeout(initTrackMap, 300);
        });
    });
    document.getElementById('startTrackBtn')?.addEventListener('click', startTracking);
}

// ===== ADMIN PAGE =====
function initAdmin() {
    checkSession().then(user => {
        if (!user || (!user.isAdmin && !user.isOwner)) {
            window.location.href = 'login.html';
            return;
        }
        updateBadge();
        refreshAllData().then(() => {
            refreshAdminData();
            loadTrips();
            setupDriverRegistration();
        });
    });
}

function refreshAdminData() {
    const drivers = allDrivers.filter(d => d.createdBy === currentUser.uid || d.createdByUsername === currentUser.username);
    const bookings = allBookings;
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.fare || 0), 0);

    document.getElementById('adminDrivers').textContent = drivers.length;
    document.getElementById('adminPassengers').textContent = [...new Set(bookings.map(b => b.passengerId))].length;
    document.getElementById('adminBookings').textContent = bookings.length;
    document.getElementById('adminRevenue').textContent = '₱' + totalRevenue.toFixed(0);

    const adminUser = allUsers.find(u => u.uid === currentUser.uid);
    const companyName = adminUser?.company || 'N/A';
    document.getElementById('adminCompanyDisplay').textContent = companyName;

    const tbody = document.getElementById('adminDriversTable');
    tbody.innerHTML = '';
    drivers.forEach(d => {
        const route = allRoutes.find(r => r.rid === d.routeId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.fullName || d.username || '—'}</td>
            <td>${d.plate || '—'}</td>
            <td>${(d.busType || 'standard').toUpperCase()}</td>
            <td>${route ? route.name : '—'}</td>
            <td>₱${d.fare || 0}</td>
            <td>${d.departureTime || '08:00'}</td>
            <td>${d.conductor || '—'}</td>
            <td><code>${d.driverCode || '—'}</code></td>
            <td><button class="btn-danger delete-driver-btn" data-did="${d.did}">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });
    document.querySelectorAll('.delete-driver-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            deleteDriver(this.dataset.did);
        });
    });

    const bt = document.getElementById('adminBookingsTable');
    bt.innerHTML = '';
    bookings.forEach(b => {
        const tr = document.createElement('tr');
        const time = b.createdAt?.toDate?.() ? b.createdAt.toDate().toLocaleString() : '—';
        tr.innerHTML = `
            <td>${b.passengerName || '—'}</td>
            <td>${b.routeName || '—'}</td>
            <td>${(b.busType || 'standard').toUpperCase()}</td>
            <td>₱${b.fare || 0}</td>
            <td><span class="badge badge-${b.status?.toLowerCase() || 'pending'}">${b.status || 'Pending'}</span></td>
            <td>${time}</td>
            <td>${b.otp || '—'}</td>
        `;
        bt.appendChild(tr);
    });

    document.getElementById('adminWelcome').textContent = currentUser.name || currentUser.username;
}

// ===== DRIVER REGISTRATION (FIXED – waypoints as objects) =====
function setupDriverRegistration() {
    const form = document.getElementById('driverRegForm');
    if (!form) {
        console.error('Driver registration form not found!');
        return;
    }

    const specialCodeInput = document.getElementById('regSpecialCode');
    if (specialCodeInput && !specialCodeInput.value) {
        specialCodeInput.value = generateCode();
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('⚡ Driver registration form submitted');

        if (!currentUser) {
            alert('Please login first.');
            return;
        }
        if (!currentUser.isAdmin && !currentUser.isOwner) {
            alert('Only admin or owner can register drivers.');
            return;
        }

        const fullName = document.getElementById('regFullName')?.value.trim();
        const address = document.getElementById('regAddress')?.value.trim();
        const license = document.getElementById('regLicense')?.value.trim();
        const plate = document.getElementById('regPlate')?.value.trim();
        const busType = document.getElementById('regBusType')?.value;
        const fare = parseFloat(document.getElementById('fare')?.value);
        const routeName = document.getElementById('routeName')?.value.trim();
        const fromStr = document.getElementById('fromCoord')?.value.trim();
        const toStr = document.getElementById('toCoord')?.value.trim();
        const departure = document.getElementById('departureTime')?.value || '08:00';
        const conductor = document.getElementById('regConductor')?.value.trim() || '';
        const capacity = parseInt(document.getElementById('regCapacity')?.value) || 12;
        const specialCode = document.getElementById('regSpecialCode')?.value.trim();

        const requiredFields = [
            { value: fullName, name: 'Full Name' },
            { value: address, name: 'Address' },
            { value: license, name: 'License' },
            { value: plate, name: 'Bus Plate' },
            { value: routeName, name: 'Route Name' },
            { value: fromStr, name: 'From Coordinates' },
            { value: toStr, name: 'To Coordinates' }
        ];

        for (const field of requiredFields) {
            if (!field.value) {
                alert(`Please fill in: ${field.name}`);
                return;
            }
        }

        if (!specialCode) {
            alert('Access code is required.');
            document.getElementById('regSpecialCode').value = generateCode();
            return;
        }

        if (isNaN(fare) || fare < 0) {
            alert('Please enter a valid fare.');
            return;
        }

        console.log('📝 Form data collected:', { fullName, plate, busType, fare, routeName });

        let fromLat, fromLng, toLat, toLng;
        try {
            [fromLat, fromLng] = dmsToDecimal(fromStr);
            [toLat, toLng] = dmsToDecimal(toStr);
        } catch (err) {
            alert('Invalid coordinate format. Use DMS like 10°15\'30.3"N 123°49\'18.6"E');
            return;
        }

        const hashedCode = await hashString(specialCode);
        const codeQuery = query(collection(db, 'users'), where('password', '==', hashedCode));
        const codeSnap = await getDocs(codeQuery);
        if (!codeSnap.empty) {
            alert('Access code already in use. Generating a new one...');
            document.getElementById('regSpecialCode').value = generateCode();
            return;
        }

        try {
            const ip = await getIPAddress();
            const username = 'driver_' + Date.now();

            const userData = {
                username: username,
                name: fullName,
                ip: ip,
                password: hashedCode,
                isDriver: true,
                isAdmin: false,
                isOwner: false,
                activated: false,
                specialCode: specialCode,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            };

            const userRef = await addDoc(collection(db, 'users'), userData);
            console.log('✅ Driver user created:', userRef.id);

            // Fetch waypoints as objects
            const waypoints = await fetchRoadRoute(fromLat, fromLng, toLat, toLng);
            const routeData = {
                name: routeName,
                waypoints: waypoints, // array of {lat, lng} objects
                createdAt: serverTimestamp()
            };
            const routeRef = await addDoc(collection(db, 'routes'), routeData);
            console.log('✅ Route created:', routeRef.id);

            const driverData = {
                fullName: fullName,
                address: address,
                license: license,
                plate: plate,
                busType: busType,
                fare: fare,
                routeId: routeRef.id,
                departureTime: departure,
                conductor: conductor,
                capacity: capacity,
                userId: userRef.id,
                driverCode: specialCode,
                createdBy: currentUser.uid,
                createdByUsername: currentUser.username || 'admin',
                createdAt: serverTimestamp()
            };

            await addDoc(collection(db, 'drivers'), driverData);
            console.log('✅ Driver profile created');

            alert(`✅ Driver registered successfully!\n\nAccess Code: ${specialCode}\n\nShare this code with the driver so they can activate their account.`);

            form.reset();
            document.getElementById('regSpecialCode').value = generateCode();
            document.getElementById('driverRegFormContainer').style.display = 'none';

            await refreshAllData();
            refreshAdminData();
            loadTrips();

        } catch (error) {
            console.error('❌ Driver registration error:', error);
            alert('Error registering driver: ' + error.message);
        }
    });
}

function toggleDriverForm() {
    const container = document.getElementById('driverRegFormContainer');
    if (!container) return;
    
    const isVisible = container.style.display !== 'none';
    container.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        const codeInput = document.getElementById('regSpecialCode');
        if (codeInput) {
            codeInput.value = generateCode();
            codeInput.style.backgroundColor = 'rgba(255,255,255,0.05)';
        }
        const errorEl = document.getElementById('regError');
        if (errorEl) errorEl.textContent = '';
    }
}

async function deleteDriver(did) {
    if (!confirm('Delete this driver?')) return;
    try {
        const driver = allDrivers.find(d => d.did === did);
        if (driver && driver.userId) {
            await deleteDoc(doc(db, 'users', driver.userId));
        }
        await deleteDoc(doc(db, 'drivers', did));
        await refreshAllData();
        if (window.location.pathname.includes('admin.html')) refreshAdminData();
        if (window.location.pathname.includes('owner.html')) refreshOwnerData();
        loadTrips();
    } catch (e) { alert('Error: ' + e.message); }
}

// ===== DRIVER PAGE =====
function initDriver() {
    checkSession().then(user => {
        if (!user || !user.isDriver) {
            window.location.href = 'login.html';
            return;
        }
        updateBadge();
        refreshAllData().then(refreshDriverData);
    });
}

function refreshDriverData() {
    const driver = allDrivers.find(d => d.userId === currentUser.uid);
    if (!driver) {
        document.getElementById('driverWelcome').textContent = 'No driver profile found.';
        return;
    }
    document.getElementById('driverWelcome').textContent = driver.fullName || driver.username || 'Driver';
    document.getElementById('driverBusDisplay').textContent = driver.plate || '—';
    const route = allRoutes.find(r => r.rid === driver.routeId);
    document.getElementById('driverRouteDisplay').textContent = route ? route.name : '—';
    document.getElementById('driverConductorDisplay').textContent = driver.conductor || '—';

    const list = document.getElementById('driverPassengerList');
    list.innerHTML = '';
    const myBookings = allBookings.filter(b => b.driverId === driver.did);
    myBookings.forEach((b) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><strong>${b.passengerName || '—'}</strong> — Seat ${b.seatNumber || '?'} — Fare: ₱${b.fare || 0} — <span class="badge badge-${b.status?.toLowerCase() || 'pending'}">${b.status || 'Pending'}</span></span>
            <div class="actions">
                <button class="verify-btn" data-bid="${b.bid}">Verify</button>
                <button class="board-btn" data-bid="${b.bid}">Boarded</button>
            </div>
        `;
        list.appendChild(li);
    });
    document.querySelectorAll('.verify-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            updateBookingStatus(this.dataset.bid, 'Verified');
        });
    });
    document.querySelectorAll('.board-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            updateBookingStatus(this.dataset.bid, 'Boarded');
        });
    });
}

async function updateBookingStatus(bid, status) {
    try {
        await updateDoc(doc(db, 'bookings', bid), { status });
        await refreshAllData();
        refreshDriverData();
    } catch (e) { alert('Error: ' + e.message); }
}

function startSharingLocation() {
    if (!currentUser || !currentUser.isDriver) {
        alert('Only drivers can share location.');
        return;
    }
    if (!navigator.geolocation) {
        alert('Geolocation not supported.');
        return;
    }

    document.getElementById('driverGpsStatus').textContent = 'Requesting GPS…';

    locationWatchId = navigator.geolocation.watchPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            document.getElementById('driverGpsStatus').textContent =
                `Last update: ${new Date().toLocaleTimeString()}`;

            try {
                if (window.db && window.doc && window.setDoc && window.serverTimestamp) {
                    const ref = window.doc(window.db, 'driverLocations', currentUser.username);
                    await window.setDoc(ref, {
                        lat: latitude,
                        lng: longitude,
                        timestamp: window.serverTimestamp(),
                        driverName: currentUser.username,
                        busPlate: allDrivers.find(d => d.userId === currentUser.uid)?.plate ||
                            'N/A',
                        routeId: allDrivers.find(d => d.userId === currentUser.uid)?.routeId ||
                            null
                    });
                }
            } catch (e) {
                console.warn('GPS send error:', e);
                document.getElementById('driverGpsStatus').textContent = 'Error sending location';
            }
        },
        (error) => {
            document.getElementById('driverGpsStatus').textContent = 'GPS error: ' + error.message;
        }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    document.getElementById('driverStartSharing').classList.add('hidden');
    document.getElementById('driverStopSharing').classList.remove('hidden');
}

function stopSharingLocation() {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
    document.getElementById('driverGpsStatus').textContent = 'Location sharing stopped.';
    document.getElementById('driverStartSharing').classList.remove('hidden');
    document.getElementById('driverStopSharing').classList.add('hidden');
}

// ===== OWNER PAGE =====
function initOwner() {
    checkSession().then(user => {
        if (!user || !user.isOwner) {
            window.location.href = 'login.html';
            return;
        }
        updateBadge();
        refreshAllData().then(() => {
            refreshOwnerData();
            setupAdminForm();
        });
    });
}

function refreshOwnerData() {
    document.getElementById('ownerWelcome').textContent = currentUser.name || currentUser.username;
    const userCount = allUsers.filter(u => u.role === 'user').length;
    document.getElementById('ownerTotalUsers').textContent = userCount;
    document.getElementById('ownerTotalDrivers').textContent = allDrivers.length;
    document.getElementById('ownerTotalBookings').textContent = allBookings.length;
    const totalRev = allBookings.reduce((s, b) => s + (b.fare || 0), 0);
    document.getElementById('ownerTotalRevenue').textContent = '₱' + totalRev.toFixed(0);

    const companyList = document.getElementById('companyList');
    companyList.innerHTML = '';
    const admins = allUsers.filter(u => u.isAdmin === true);
    if (admins.length === 0) {
        companyList.innerHTML = '<p style="color:rgba(255,255,255,0.5);">No companies registered yet.</p>';
    } else {
        admins.forEach(admin => {
            const div = document.createElement('div');
            div.className = 'company-card';
            const driverCount = allDrivers.filter(d => d.createdBy === admin.uid || d.createdByUsername === admin.username).length;
            const bookings = allBookings.filter(b => {
                const driver = allDrivers.find(d => d.did === b.driverId);
                return driver && (driver.createdBy === admin.uid || driver.createdByUsername === admin.username);
            });
            const revenue = bookings.reduce((s, b) => s + (b.fare || 0), 0);
            div.innerHTML = `
                <div>
                    <div class="company-name">${admin.company || admin.username}</div>
                    <div class="company-stats">${driverCount} drivers · ${bookings.length} bookings · ₱${revenue.toFixed(0)} revenue</div>
                </div>
                <button class="view-company-btn" data-uid="${admin.uid}">View Details</button>
            `;
            companyList.appendChild(div);
        });
        document.querySelectorAll('.view-company-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                viewCompany(this.dataset.uid);
            });
        });
    }

    const at = document.getElementById('ownerAdminsTable');
    at.innerHTML = '';
    admins.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${a.company || '—'}</td>
            <td>${a.name || '—'}</td>
            <td>${a.location || '—'}</td>
            <td>${a.contact || '—'}</td>
            <td><code>${a.specialCode || '—'}</code></td>
            <td><button class="btn-danger delete-user-btn" data-uid="${a.uid}">Delete</button></td>
        `;
        at.appendChild(tr);
    });
    document.querySelectorAll('#ownerAdminsTable .delete-user-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            deleteUser(this.dataset.uid);
        });
    });

    const ut = document.getElementById('ownerUsersTable');
    ut.innerHTML = '';
    allUsers.filter(u => u.role === 'user').forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.username}</td>
            <td>User</td>
            <td>${u.ip || '—'}</td>
            <td><button class="btn-danger delete-user-btn" data-uid="${u.uid}">Delete</button></td>
        `;
        ut.appendChild(tr);
    });
    document.querySelectorAll('#ownerUsersTable .delete-user-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            deleteUser(this.dataset.uid);
        });
    });

    const bt = document.getElementById('ownerBookingsTable');
    bt.innerHTML = '';
    allBookings.forEach(b => {
        const tr = document.createElement('tr');
        const time = b.createdAt?.toDate?.() ? b.createdAt.toDate().toLocaleString() : '—';
        tr.innerHTML = `
            <td>${b.passengerName || '—'}</td>
            <td>${b.routeName || '—'}</td>
            <td>₱${b.fare || 0}</td>
            <td><span class="badge badge-${b.status?.toLowerCase() || 'pending'}">${b.status || 'Pending'}</span></td>
            <td>${time}</td>
            <td>${b.otp || '—'}</td>
        `;
        bt.appendChild(tr);
    });

    const dt = document.getElementById('ownerDriversTable');
    dt.innerHTML = '';
    allDrivers.forEach(d => {
        const driverBookings = allBookings.filter(b => b.driverId === d.did);
        const earnings = driverBookings.reduce((s, b) => s + (b.fare || 0), 0);
        const route = allRoutes.find(r => r.rid === d.routeId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.fullName || d.username || '—'}</td>
            <td>${d.plate || '—'}</td>
            <td>${(d.busType || 'standard').toUpperCase()}</td>
            <td>${route ? route.name : '—'}</td>
            <td>₱${d.fare || 0}</td>
            <td>${d.conductor || '—'}</td>
            <td>${driverBookings.length}</td>
            <td>₱${earnings.toFixed(0)}</td>
            <td><button class="btn-danger delete-driver-btn" data-did="${d.did}">Delete</button></td>
        `;
        dt.appendChild(tr);
    });
    document.querySelectorAll('#ownerDriversTable .delete-driver-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            deleteDriver(this.dataset.did);
        });
    });
}

function viewCompany(adminUid) {
    selectedCompanyId = adminUid;
    const admin = allUsers.find(u => u.uid === adminUid);
    if (!admin) return;

    document.getElementById('companyDetailContainer').style.display = 'block';
    document.getElementById('companyDetailName').textContent = admin.company || admin.username;

    const drivers = allDrivers.filter(d => d.createdBy === admin.uid || d.createdByUsername === admin.username);
    document.getElementById('companyDriverCount').textContent = drivers.length;

    const driverIds = drivers.map(d => d.did);
    const companyBookings = allBookings.filter(b => driverIds.includes(b.driverId));
    const totalPassengers = companyBookings.length;
    const totalRevenue = companyBookings.reduce((s, b) => s + (b.fare || 0), 0);
    document.getElementById('companyPassengerCount').textContent = totalPassengers;
    document.getElementById('companyRevenue').textContent = '₱' + totalRevenue.toFixed(0);

    const tbody = document.getElementById('companyDriversTable');
    tbody.innerHTML = '';
    drivers.forEach(d => {
        const route = allRoutes.find(r => r.rid === d.routeId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.fullName || d.username || '—'}</td>
            <td>${d.plate || '—'}</td>
            <td>${route ? route.name : '—'}</td>
            <td>₱${d.fare || 0}</td>
            <td>${d.conductor || '—'}</td>
        `;
        tbody.appendChild(tr);
    });

    refreshCompanyStats('all');
}

function closeCompanyDetail() {
    document.getElementById('companyDetailContainer').style.display = 'none';
    selectedCompanyId = null;
}

function refreshCompanyStats(period) {
    if (!selectedCompanyId) return;
    const admin = allUsers.find(u => u.uid === selectedCompanyId);
    if (!admin) return;
    const drivers = allDrivers.filter(d => d.createdBy === admin.uid || d.createdByUsername === admin.username);
    const driverIds = drivers.map(d => d.did);
    let bookings = allBookings.filter(b => driverIds.includes(b.driverId));

    const now = new Date();
    if (period === 'day') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        bookings = bookings.filter(b => {
            const d = b.createdAt?.toDate?.();
            return d && d >= start;
        });
    } else if (period === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        bookings = bookings.filter(b => {
            const d = b.createdAt?.toDate?.();
            return d && d >= start;
        });
    } else if (period === 'year') {
        const start = new Date(now.getFullYear(), 0, 1);
        bookings = bookings.filter(b => {
            const d = b.createdAt?.toDate?.();
            return d && d >= start;
        });
    }

    const passengers = bookings.length;
    const revenue = bookings.reduce((s, b) => s + (b.fare || 0), 0);

    const labelMap = { day: 'Today', month: 'This Month', year: 'This Year', all: 'All Time' };
    document.getElementById('companyPeriodLabel').textContent = labelMap[period] || 'All Time';
    document.getElementById('companyPeriodPassengers').textContent = passengers;
    document.getElementById('companyPeriodRevenue').textContent = revenue.toFixed(0);
}

function setupAdminForm() {
    const form = document.getElementById('addAdminForm');
    document.getElementById('newAdminSpecialCode').value = generateCode();

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!currentUser || !currentUser.isOwner) {
            alert('Only the owner can add admins.');
            return;
        }

        const company = document.getElementById('newAdminCompany').value.trim();
        const name = document.getElementById('newAdminName').value.trim();
        const location = document.getElementById('newAdminLocation').value.trim();
        const contact = document.getElementById('newAdminContact').value.trim();
        const specialCode = document.getElementById('newAdminSpecialCode').value.trim();

        if (!company || !name || !location || !contact || !specialCode) {
            alert('Please fill in all admin details.');
            return;
        }

        const hashedCode = await hashString(specialCode);
        const codeQuery = query(collection(db, 'users'), where('password', '==', hashedCode));
        const codeSnap = await getDocs(codeQuery);
        if (!codeSnap.empty) {
            alert('Access code already in use. Generate a new one.');
            document.getElementById('newAdminSpecialCode').value = generateCode();
            return;
        }

        const ip = await getIPAddress();
        const username = 'admin_' + Date.now();

        const userData = {
            username: username,
            name: name,
            company: company,
            location: location,
            contact: contact,
            ip: ip,
            password: hashedCode,
            isAdmin: true,
            isDriver: false,
            isOwner: false,
            activated: false,
            specialCode: specialCode,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
        };
        await addDoc(collection(db, 'users'), userData);

        alert(`Admin added successfully! Access code: ${specialCode}`);
        form.reset();
        document.getElementById('newAdminSpecialCode').value = generateCode();
        await refreshAllData();
        refreshOwnerData();
    });
}

async function deleteUser(uid) {
    if (!confirm('Delete this user?')) return;
    try {
        const user = allUsers.find(u => u.uid === uid);
        if (user && user.isDriver) {
            const driver = allDrivers.find(d => d.userId === uid);
            if (driver) {
                await deleteDoc(doc(db, 'drivers', driver.did));
            }
        }
        await deleteDoc(doc(db, 'users', uid));
        await refreshAllData();
        refreshOwnerData();
    } catch (e) { alert('Error: ' + e.message); }
}

// ============================================================
// COMMON UI HELPERS
// ============================================================
function updateBadge() {
    const badge = document.getElementById('userBadge');
    const name = document.getElementById('userBadgeName');
    const login = document.getElementById('menuLogin');
    const logout = document.getElementById('menuLogout');
    const menuAdmin = document.getElementById('menuAdmin');
    const menuDriver = document.getElementById('menuDriver');
    const menuOwner = document.getElementById('menuOwner');

    if (currentUser) {
        if (badge) badge.style.display = 'flex';
        if (name) name.textContent = currentUser.name || currentUser.username || 'User';
        if (login) {
            if (currentUser.isAdmin || currentUser.isDriver || currentUser.isOwner) {
                login.textContent = '⚙️ MANAGE';
                login.style.display = 'flex';
                login.href = currentUser.isOwner ? 'owner.html' : 
                           currentUser.isAdmin ? 'admin.html' : 'driver.html';
            } else {
                login.textContent = '👤 ' + (currentUser.name || currentUser.username);
                login.style.display = 'flex';
                login.href = 'book.html';
            }
        }
        if (logout) logout.style.display = 'flex';
        if (menuAdmin) menuAdmin.style.display = currentUser.isAdmin || currentUser.isOwner ? 'flex' : 'none';
        if (menuDriver) menuDriver.style.display = currentUser.isDriver ? 'flex' : 'none';
        if (menuOwner) menuOwner.style.display = currentUser.isOwner ? 'flex' : 'none';
    } else {
        if (badge) badge.style.display = 'none';
        if (login) {
            login.textContent = '🔑 Login';
            login.style.display = 'flex';
            login.href = 'login.html';
        }
        if (logout) logout.style.display = 'none';
        if (menuAdmin) menuAdmin.style.display = 'none';
        if (menuDriver) menuDriver.style.display = 'none';
        if (menuOwner) menuOwner.style.display = 'none';
    }
    const stats = document.getElementById('homeStatsContainer');
    const msg = document.getElementById('homeUserMessage');
    if (stats && msg) {
        if (currentUser && (currentUser.isAdmin || currentUser.isOwner)) {
            stats.style.display = 'block';
            msg.style.display = 'none';
        } else {
            stats.style.display = 'none';
            msg.style.display = 'block';
        }
    }
}

function toggleMenu() {
    const menu = document.getElementById('dropdownMenu');
    if (menu) menu.classList.toggle('show');
}

// ============================================================
// PAGE INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async function() {
    await ensureOwnerExists();
    const page = window.location.pathname.split('/').pop() || 'index.html';
    switch (page) {
        case 'index.html':
            break;
        case 'login.html':
            initLogin();
            break;
        case 'book.html':
            initBook();
            break;
        case 'track.html':
            initTrack();
            break;
        case 'admin.html':
            initAdmin();
            break;
        case 'driver.html':
            initDriver();
            break;
        case 'owner.html':
            initOwner();
            break;
        default:
            break;
    }
});

// ============================================================
// GLOBAL EVENT LISTENERS
// ============================================================
document.addEventListener('click', function(e) {
    const menu = document.getElementById('dropdownMenu');
    const hamburger = document.getElementById('hamburgerBtn');
    if (menu && menu.classList.contains('show') && !menu.contains(e.target) && !hamburger.contains(e.target)) {
        menu.classList.remove('show');
    }
});

document.getElementById('hamburgerBtn')?.addEventListener('click', toggleMenu);
document.getElementById('logoutMenuItem')?.addEventListener('click', logoutUser);
document.getElementById('toggleDriverFormBtn')?.addEventListener('click', toggleDriverForm);
document.getElementById('closeCompanyDetailBtn')?.addEventListener('click', closeCompanyDetail);

// ============================================================
// EXPOSE FUNCTIONS GLOBALLY
// ============================================================
window.performLogin = performLogin;
window.logoutUser = logoutUser;
window.checkSession = checkSession;
window.selectLoginRole = selectLoginRole;
window.submitLogin = submitLogin;
window.submitSignup = submitSignup;
window.toggleMenu = toggleMenu;
window.toggleDriverForm = toggleDriverForm;
window.deleteDriver = deleteDriver;
window.deleteUser = deleteUser;
window.updateBookingStatus = updateBookingStatus;
window.startSharingLocation = startSharingLocation;
window.stopSharingLocation = stopSharingLocation;
window.startTracking = startTracking;
window.viewCompany = viewCompany;
window.closeCompanyDetail = closeCompanyDetail;
window.refreshCompanyStats = refreshCompanyStats;
window.generateCode = generateCode;
window.hashString = hashString;
window.getIPAddress = getIPAddress;
window.dmsToDecimal = dmsToDecimal;
window.fetchRoadRoute = fetchRoadRoute;
window.assignSeat = assignSeat;
window.renderSeats = renderSeats;
window.loadTrips = loadTrips;
window.initTrackMap = initTrackMap;
window.updateETA = updateETA;
window.refreshAdminData = refreshAdminData;
window.refreshDriverData = refreshDriverData;
window.refreshOwnerData = refreshOwnerData;
window.updateBadge = updateBadge;
window.activateAccount = activateAccount;
window.ensureOwnerExists = ensureOwnerExists;

console.log('🚌 Bus Booking System loaded successfully!');
console.log('👤 Owner code: owner123 (auto-created if not exists)');
console.log('📌 All data stored in Firebase Firestore.');