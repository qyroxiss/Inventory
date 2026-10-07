// Indian cities and their states, for Ledger Creation's City box: typing offers these, and
// picking one fills the State. Not in MDA (its City list is only what has been typed before);
// added on the owner's request (2026-10-07). Major cities and district headquarters; any other
// city can still be typed, and the cities a book has used are offered too. State names are
// exactly INDIAN_STATES (ledgers.ts). Where a name exists in two states, the larger city wins.

const BY_STATE: Record<string, string[]> = {
  'Andaman & Nicobar Islands': ['Port Blair'],
  'Andhra Pradesh': [
    'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Rajahmundry', 'Kakinada',
    'Tirupati', 'Kadapa', 'Anantapur', 'Eluru', 'Ongole', 'Vizianagaram', 'Srikakulam',
    'Machilipatnam', 'Chittoor', 'Hindupur', 'Bhimavaram', 'Tenali', 'Proddatur', 'Amaravati',
  ],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro'],
  Assam: [
    'Guwahati', 'Dispur', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur',
    'Bongaigaon', 'Karimganj', 'Sivasagar', 'Goalpara', 'Dhubri', 'Diphu',
  ],
  Bihar: [
    'Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Arrah', 'Begusarai',
    'Katihar', 'Munger', 'Chapra', 'Sasaram', 'Hajipur', 'Dehri', 'Bettiah', 'Motihari',
    'Siwan', 'Saharsa', 'Buxar', 'Kishanganj', 'Sitamarhi', 'Samastipur', 'Nalanda',
  ],
  Chandigarh: ['Chandigarh'],
  Chhattisgarh: [
    'Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon', 'Raigarh', 'Jagdalpur',
    'Ambikapur', 'Dhamtari', 'Mahasamund', 'Kanker',
  ],
  'Dadra & Nagar Haveli and Daman & Diu': ['Silvassa', 'Daman', 'Diu'],
  Delhi: ['New Delhi', 'Delhi'],
  Goa: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'],
  Gujarat: [
    'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar',
    'Junagadh', 'Gandhidham', 'Anand', 'Navsari', 'Morbi', 'Nadiad', 'Surendranagar', 'Bharuch',
    'Mehsana', 'Bhuj', 'Porbandar', 'Palanpur', 'Valsad', 'Vapi', 'Godhra', 'Patan', 'Veraval',
    'Amreli', 'Dahod', 'Botad', 'Ankleshwar',
  ],
  Haryana: [
    'Gurugram', 'Gurgaon', 'Faridabad', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar',
    'Karnal', 'Sonipat', 'Panchkula', 'Bhiwani', 'Sirsa', 'Bahadurgarh', 'Jind', 'Thanesar',
    'Kaithal', 'Rewari', 'Palwal', 'Kurukshetra', 'Jhajjar', 'Fatehabad', 'Narnaul',
  ],
  'Himachal Pradesh': [
    'Shimla', 'Dharamshala', 'Solan', 'Mandi', 'Kullu', 'Manali', 'Hamirpur', 'Una',
    'Chamba', 'Nahan', 'Palampur', 'Baddi',
  ],
  'Jammu & Kashmir': [
    'Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Sopore', 'Kathua', 'Udhampur', 'Pulwama',
    'Rajouri', 'Poonch', 'Kupwara',
  ],
  Jharkhand: [
    'Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh', 'Giridih',
    'Ramgarh', 'Phusro', 'Medininagar', 'Chaibasa', 'Dumka', 'Sahibganj',
  ],
  Karnataka: [
    'Bengaluru', 'Bangalore', 'Mysuru', 'Mysore', 'Hubballi', 'Hubli', 'Dharwad', 'Mangaluru',
    'Mangalore', 'Belagavi', 'Belgaum', 'Kalaburagi', 'Gulbarga', 'Davanagere', 'Ballari',
    'Bellary', 'Vijayapura', 'Bijapur', 'Shivamogga', 'Shimoga', 'Tumakuru', 'Tumkur', 'Raichur',
    'Bidar', 'Udupi', 'Hassan', 'Mandya', 'Chitradurga', 'Kolar', 'Chikkamagaluru', 'Hosapete',
    'Gadag', 'Bagalkot', 'Karwar', 'Madikeri', 'Chamarajanagar', 'Ramanagara', 'Koppal', 'Yadgir',
  ],
  Kerala: [
    'Thiruvananthapuram', 'Trivandrum', 'Kochi', 'Cochin', 'Ernakulam', 'Kozhikode', 'Calicut',
    'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad', 'Kottayam', 'Malappuram',
    'Kasaragod', 'Pathanamthitta', 'Idukki', 'Kalpetta', 'Thalassery', 'Manjeri',
  ],
  Ladakh: ['Leh', 'Kargil'],
  Lakshadweep: ['Kavaratti'],
  'Madhya Pradesh': [
    'Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam',
    'Rewa', 'Murwara', 'Katni', 'Singrauli', 'Burhanpur', 'Khandwa', 'Bhind', 'Chhindwara',
    'Guna', 'Shivpuri', 'Vidisha', 'Chhatarpur', 'Damoh', 'Mandsaur', 'Khargone', 'Neemuch',
    'Pithampur', 'Hoshangabad', 'Narmadapuram', 'Itarsi', 'Sehore', 'Betul', 'Seoni', 'Datia',
    'Morena', 'Balaghat', 'Shahdol', 'Mandla', 'Jhabua', 'Dhar',
  ],
  Maharashtra: [
    'Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Chhatrapati Sambhajinagar',
    'Solapur', 'Kalyan', 'Dombivli', 'Vasai', 'Virar', 'Navi Mumbai', 'Kolhapur', 'Amravati',
    'Sangli', 'Malegaon', 'Jalgaon', 'Akola', 'Latur', 'Dhule', 'Ahmednagar', 'Ahilyanagar',
    'Chandrapur', 'Parbhani', 'Ichalkaranji', 'Jalna', 'Bhiwandi', 'Panvel', 'Satara', 'Beed',
    'Yavatmal', 'Kamptee', 'Gondia', 'Barshi', 'Achalpur', 'Osmanabad', 'Dharashiv', 'Nanded',
    'Sangamner', 'Wardha', 'Udgir', 'Hinganghat', 'Ratnagiri', 'Pimpri-Chinchwad', 'Baramati',
    'Bhusawal', 'Ulhasnagar', 'Mira-Bhayandar', 'Alibag', 'Sindhudurg', 'Bhandara', 'Buldhana',
    'Washim', 'Hingoli', 'Gadchiroli', 'Nandurbar', 'Palghar', 'Lonavala', 'Shirdi',
  ],
  Manipur: ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Ukhrul'],
  Meghalaya: ['Shillong', 'Tura', 'Jowai', 'Nongstoin'],
  Mizoram: ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip'],
  Nagaland: ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha'],
  Odisha: [
    'Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Brahmapur', 'Sambalpur', 'Puri',
    'Balasore', 'Baleshwar', 'Bhadrak', 'Baripada', 'Jharsuguda', 'Jeypore', 'Bargarh',
    'Angul', 'Dhenkanal', 'Kendrapara', 'Jajpur', 'Rayagada', 'Koraput', 'Paradip', 'Bolangir',
  ],
  Puducherry: ['Puducherry', 'Pondicherry', 'Karaikal', 'Mahe', 'Yanam'],
  Punjab: [
    'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur',
    'Pathankot', 'Moga', 'Batala', 'Abohar', 'Malerkotla', 'Khanna', 'Phagwara', 'Muktsar',
    'Barnala', 'Rajpura', 'Firozpur', 'Kapurthala', 'Sangrur', 'Faridkot', 'Gurdaspur',
    'Fazilka', 'Mansa', 'Rupnagar', 'Ropar', 'Nawanshahr', 'Tarn Taran', 'Zirakpur',
  ],
  Rajasthan: [
    'Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer', 'Udaipur', 'Bhilwara', 'Alwar',
    'Bharatpur', 'Sikar', 'Pali', 'Sri Ganganagar', 'Ganganagar', 'Kishangarh', 'Tonk',
    'Beawar', 'Hanumangarh', 'Dhaulpur', 'Gangapur City', 'Sawai Madhopur', 'Churu',
    'Jhunjhunu', 'Barmer', 'Nagaur', 'Chittorgarh', 'Jaisalmer', 'Banswara', 'Bundi',
    'Dungarpur', 'Jhalawar', 'Sirohi', 'Rajsamand', 'Dausa', 'Karauli',
    'Mount Abu', 'Bhiwadi',
  ],
  Sikkim: ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan'],
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Trichy', 'Salem', 'Tirunelveli',
    'Tiruppur', 'Vellore', 'Erode', 'Thoothukudi', 'Tuticorin', 'Dindigul', 'Thanjavur',
    'Ranipet', 'Sivakasi', 'Karur', 'Udhagamandalam', 'Ooty', 'Hosur', 'Nagercoil',
    'Kanchipuram', 'Kumarapalayam', 'Karaikudi', 'Neyveli', 'Cuddalore', 'Kumbakonam',
    'Tiruvannamalai', 'Pollachi', 'Rajapalayam', 'Gudiyatham', 'Pudukkottai', 'Vaniyambadi',
    'Ambur', 'Nagapattinam', 'Villupuram', 'Krishnagiri', 'Dharmapuri', 'Namakkal',
    'Ramanathapuram', 'Virudhunagar', 'Theni', 'Sivaganga', 'Perambalur', 'Ariyalur',
    'Kallakurichi', 'Tiruvallur', 'Chengalpattu', 'Tenkasi', 'Mayiladuthurai',
  ],
  Telangana: [
    'Hyderabad', 'Secunderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam',
    'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet', 'Miryalaguda',
    'Siddipet', 'Mancherial', 'Sangareddy', 'Kamareddy', 'Jagtial', 'Kothagudem', 'Medak',
    'Nirmal', 'Wanaparthy', 'Vikarabad',
  ],
  Tripura: ['Agartala', 'Dharmanagar', 'Kailashahar', 'Belonia'],
  'Uttar Pradesh': [
    'Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Allahabad',
    'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Gorakhpur', 'Noida', 'Greater Noida',
    'Firozabad', 'Jhansi', 'Muzaffarnagar', 'Mathura', 'Ayodhya', 'Faizabad', 'Rampur',
    'Shahjahanpur', 'Farrukhabad', 'Mau', 'Hapur', 'Etawah', 'Mirzapur', 'Bulandshahr',
    'Sambhal', 'Amroha', 'Hardoi', 'Fatehpur', 'Raebareli', 'Orai', 'Sitapur', 'Bahraich',
    'Modinagar', 'Unnao', 'Jaunpur', 'Lakhimpur', 'Hathras', 'Banda', 'Pilibhit',
    'Mughalsarai', 'Barabanki', 'Gonda', 'Mainpuri', 'Lalitpur', 'Etah', 'Deoria',
    'Ballia', 'Azamgarh', 'Sultanpur', 'Basti', 'Ghazipur', 'Bijnor', 'Shamli', 'Kannauj',
    'Pratapgarh', 'Chitrakoot', 'Kushinagar', 'Vrindavan',
  ],
  Uttarakhand: [
    'Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rudrapur', 'Kashipur', 'Rishikesh',
    'Nainital', 'Almora', 'Pithoragarh', 'Mussoorie', 'Kotdwar', 'Ramnagar', 'Pauri',
  ],
  'West Bengal': [
    'Kolkata', 'Calcutta', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Bardhaman',
    'Burdwan', 'Malda', 'English Bazar', 'Baharampur', 'Habra', 'Kharagpur', 'Shantipur',
    'Dankuni', 'Dhulian', 'Ranaghat', 'Haldia', 'Raiganj', 'Krishnanagar', 'Nabadwip',
    'Medinipur', 'Midnapore', 'Jalpaiguri', 'Balurghat', 'Basirhat', 'Bankura', 'Chakdaha',
    'Darjeeling', 'Alipurduar', 'Purulia', 'Jangipur', 'Bangaon', 'Cooch Behar', 'Bolpur',
    'Barasat', 'Barrackpore', 'Serampore', 'Hooghly', 'Tamluk', 'Kalimpong', 'Suri',
  ],
}; // prettier-ignore

/** Every listed city with its state, A to Z. */
export const CITY_STATES: readonly { city: string; state: string }[] = Object.entries(BY_STATE)
  .flatMap(([state, cities]) => cities.map((city) => ({ city, state })))
  .sort((a, b) => a.city.localeCompare(b.city));

const lookup = new Map(CITY_STATES.map((c) => [c.city.toLowerCase(), c.state]));

/** The state of a listed city (any case), or null. */
export const stateOfCity = (city: string): string | null =>
  lookup.get(city.trim().toLowerCase()) ?? null;
