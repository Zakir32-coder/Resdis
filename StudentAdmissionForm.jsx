import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../shared/contexts/AuthContext";
import { useInstitution } from "../../../shared/contexts/InstitutionContext";
import { db } from "../../../app/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import toast from "react-hot-toast";
import { Loader2, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

// Helper component for form fields
const FormInput = ({ label, id, children, required }) => (
    <div>
        <label htmlFor={id} className="block mb-1.5 text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        {children}
    </div>
);

const StudentAdmissionForm = () => {
    const { userData } = useAuth();
    const { currentInstitution, loading: instLoading } = useInstitution();
    const [formData, setFormData] = useState({
        session: "", classId: "", departmentId: "", groupId: "", sectionId: "",
        admissionDate: new Date().toISOString().split("T")[0], rollNumber: "",
        registrationNo: "", previousInstitution: "",
        studentName: "", gender: "", dob: "", religion: "",
        fatherName: "", motherName: "", nationality: "Bangladesh", idNumber: "",
        fatherNid: "", motherNid: "", bloodGroup: "",
        emergencyContact: "", primaryPhone: "", address: "",
        guardianName: "", guardianRelationship: "", guardianContact: "",
        skills: "", facebookLink: "", email: ""
    });
    const [isLoading, setIsLoading] = useState(false);
    const [academicSetup, setAcademicSetup] = useState({
        classes: [], departments: [], groups: [], sections: [], shifts: [], campuses: [], visibility: {}
    });
    const [sessions, setSessions] = useState([]);

    const [showAcademicMore, setShowAcademicMore] = useState(false);
    const [showPersonalMore, setShowPersonalMore] = useState(false);
    const [showAddressMore, setShowAddressMore] = useState(false);

    useEffect(() => {
        // Ensure academicSetup and visibility are properly loaded
        if (currentInstitution?.academicSetup) {
            setAcademicSetup({
                ...currentInstitution.academicSetup,
                // Ensure visibility object exists, default to {} if not
                visibility: currentInstitution.academicSetup.visibility || {}
            });
        } else {
             setAcademicSetup({ classes: [], departments: [], groups: [], sections: [], shifts: [], campuses: [], visibility: {} });
        }
        const currentYear = new Date().getFullYear();
        setSessions([
            `${currentYear - 1}-${currentYear}`,
            `${currentYear}-${currentYear + 1}`,
            `${currentYear + 1}-${currentYear + 2}`,
        ]);
    }, [currentInstitution]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const newState = { ...prev, [name]: value };
            // Reset dependent dropdowns based on hierarchy
            if (name === 'departmentId') {
                newState.shiftId = "";
                newState.classId = "";
                newState.groupId = "";
                newState.sectionId = "";
            } else if (name === 'shiftId') {
                 newState.classId = "";
                 newState.groupId = "";
                 newState.sectionId = "";
            } else if (name === 'classId') {
                newState.groupId = "";
                newState.sectionId = "";
            } else if (name === 'groupId') {
                newState.sectionId = "";
            }
            return newState;
        });
    };

    // Filter options based on selections AND visibility - FIXED LOGIC
    const getVisibleOptions = (key) => {
        // Check if the field should be visible (visibility[key] === true)
        if (!academicSetup?.visibility?.[key]) return [];
        // Return only non-hidden items
        return (academicSetup[key] || []).filter(item => !item.isHidden);
    };

    const visibleClasses = getVisibleOptions('classes');
    const visibleDepartments = getVisibleOptions('departments');
    const visibleGroups = getVisibleOptions('groups');
    const visibleSections = getVisibleOptions('sections');
    const visibleShifts = getVisibleOptions('shifts');
    const visibleCampuses = getVisibleOptions('campuses');

    // Filter available options based on parent selections
    const availableDepartments = useMemo(() => {
        if (!formData.campusId || !visibleDepartments.length) return visibleDepartments;
        return visibleDepartments.filter(d => d.campusId === formData.campusId);
    }, [formData.campusId, visibleDepartments]);

    const availableShifts = useMemo(() => {
        if (!formData.departmentId || !visibleShifts.length) return visibleShifts;
        return visibleShifts.filter(s => s.departmentId === formData.departmentId);
    }, [formData.departmentId, visibleShifts]);

     const availableClasses = useMemo(() => {
        if (!formData.shiftId || !visibleClasses.length) return visibleClasses;
        return visibleClasses.filter(c => c.shiftId === formData.shiftId);
    }, [formData.shiftId, visibleClasses]);

    const availableGroups = useMemo(() => {
        if (!formData.classId || !visibleGroups.length) return visibleGroups;
        return visibleGroups.filter(g => g.classId === formData.classId);
    }, [formData.classId, visibleGroups]);

    const availableSections = useMemo(() => {
        if (!formData.groupId || !visibleSections.length) return visibleSections;
        return visibleSections.filter(s => s.groupId === formData.groupId);
    }, [formData.groupId, visibleSections]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentInstitution?.id || !currentInstitution?.institutionId) {
            toast.error("Institution not selected or found.");
            return;
        }
        setIsLoading(true);
        const toastId = toast.loading("Submitting admission form...");
        try {
            const studentData = {
                ...formData,
                institutionId: currentInstitution.institutionId,
                institutionDocId: currentInstitution.id,
                status: 'active',
                createdBy: userData.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            Object.keys(studentData).forEach(key => {
                // Keep empty optional fields for consistency, unless it's a *required* academic ID that is now hidden
                 if (!academicSetup.visibility?.[key.replace('Id', 's')] && key.endsWith('Id') && key !== 'classId') { // Assuming class is always required if visible
                    delete studentData[key];
                 } else if (studentData[key] === "" || studentData[key] === null) {
                    // Decide later if you want to remove empty optional fields
                 }
            });
            const admissionYear = formData.session.split('-')[0];
            const uniquePart = Math.random().toString(36).substring(2, 8).toUpperCase();
            studentData.studentUniqueId = `${currentInstitution.institutionId}-${admissionYear}-${uniquePart}`;
            const studentCollectionRef = collection(db, "students");
            await addDoc(studentCollectionRef, studentData);
            toast.success("Student admitted successfully!", { id: toastId });
            // Reset form (optional)
            // setFormData({ ...initial empty state... });
        } catch (error) {
            console.error("Error submitting form: ", error);
            toast.error("Failed to submit form. Please try again.", { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    if (instLoading) {
        // You might want to use your Loader component here
        return <div className="p-10 text-center flex justify-center items-center h-screen"><Loader2 className="animate-spin mr-2" /> Loading institution data...</div>;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex justify-center py-10 px-4">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-4xl bg-white shadow-2xl rounded-2xl p-6 md:p-8 space-y-8 border border-gray-200"
            >
                <h1 className="text-3xl font-bold text-center text-indigo-700 mb-6 border-b pb-4">
                    🎓 Student Admission Form
                </h1>

                {/* Academic Information */}
                <section className="p-5 bg-indigo-50 rounded-lg border border-indigo-200">
                    <h2 className="text-xl font-semibold mb-4 text-indigo-800">Academic Information</h2>
                    {/* Make grid columns dynamic based on visible fields */}
                    <div className={`grid md:grid-cols-${[
                            !!academicSetup.visibility?.campuses,
                            !!academicSetup.visibility?.departments,
                            !!academicSetup.visibility?.shifts,
                            !!academicSetup.visibility?.classes, // Class is always true if setup loaded
                            !!academicSetup.visibility?.groups,
                            !!academicSetup.visibility?.sections,
                        ].filter(Boolean).length > 3 ? 3 : 2} gap-5`}>

                        <FormInput label="Session" id="session" required>
                            <select name="session" value={formData.session} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500">
                                <option value="">Select Session</option>
                                {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </FormInput>

                        {/* ✅ Conditional Rendering for Academic Dropdowns - FIXED VISIBILITY LOGIC */}
                        {academicSetup.visibility?.campuses && (
                            <FormInput label="Campus" id="campusId">
                                <select name="campusId" value={formData.campusId} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500">
                                    <option value="">Select Campus</option>
                                    {visibleCampuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </FormInput>
                        )}

                        {academicSetup.visibility?.departments && (
                            <FormInput label="Department" id="departmentId">
                                <select name="departmentId" value={formData.departmentId} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" disabled={academicSetup.visibility?.campuses && !formData.campusId}>
                                    <option value="">Select Department</option>
                                    {availableDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </FormInput>
                        )}

                        {academicSetup.visibility?.shifts && (
                             <FormInput label="Shift" id="shiftId">
                                <select name="shiftId" value={formData.shiftId} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" disabled={academicSetup.visibility?.departments && !formData.departmentId}>
                                    <option value="">Select Shift</option>
                                    {availableShifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </FormInput>
                        )}

                        {academicSetup.visibility?.classes && ( // Though class is usually mandatory
                            <FormInput label="Class" id="classId" required>
                                 <select name="classId" value={formData.classId} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" disabled={academicSetup.visibility?.shifts && !formData.shiftId}>
                                    <option value="">Select Class</option>
                                    {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </FormInput>
                        )}

                        {academicSetup.visibility?.groups && (
                             <FormInput label="Group" id="groupId">
                                <select name="groupId" value={formData.groupId} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" disabled={!formData.classId}>
                                    <option value="">Select Group</option>
                                    {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </FormInput>
                        )}

                        {academicSetup.visibility?.sections && (
                            <FormInput label="Section" id="sectionId">
                                <select name="sectionId" value={formData.sectionId} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" disabled={!formData.groupId}>
                                    <option value="">Select Section</option>
                                    {availableSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </FormInput>
                        )}
                        {/* ✅ End Conditional Rendering */}

                        <FormInput label="Admission Date" id="admissionDate" required>
                            <input type="date" name="admissionDate" value={formData.admissionDate} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </FormInput>

                        <FormInput label="Roll" id="rollNumber">
                            <input type="text" name="rollNumber" placeholder="Leave blank for auto" value={formData.rollNumber} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </FormInput>
                    </div>

                    <div className="mt-4 text-right">
                         <button type="button" onClick={() => setShowAcademicMore(!showAcademicMore)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium inline-flex items-center gap-1">
                            {showAcademicMore ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                            {showAcademicMore ? "Hide Optional Info" : "More Optional Info"}
                        </button>
                    </div>

                    {showAcademicMore && (
                        <div className={`grid md:grid-cols-${[
                            !!academicSetup.visibility?.campuses,
                            !!academicSetup.visibility?.departments,
                            !!academicSetup.visibility?.shifts,
                            !!academicSetup.visibility?.classes,
                            !!academicSetup.visibility?.groups,
                            !!academicSetup.visibility?.sections,
                        ].filter(Boolean).length > 3 ? 3 : 2} gap-5 mt-4 pt-4 border-t border-indigo-100`}>
                             <FormInput label="Registration No." id="registrationNo">
                                <input type="text" name="registrationNo" placeholder="Enter registration no" value={formData.registrationNo} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                            </FormInput>
                            <FormInput label="Previous Institution" id="previousInstitution">
                                 <input type="text" name="previousInstitution" placeholder="Enter previous institution" value={formData.previousInstitution} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                            </FormInput>
                        </div>
                    )}
                </section>

                {/* Personal Information */}
                <section className="p-5 bg-blue-50 rounded-lg border border-blue-200">
                    <h2 className="text-xl font-semibold mb-4 text-blue-800">Personal Information</h2>
                    <div className="grid md:grid-cols-2 gap-5">
                        {/* Required Personal Fields */}
                        <FormInput label="Student Name" id="studentName" required><input type="text" name="studentName" placeholder="Full Name" value={formData.studentName} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                        <FormInput label="Gender" id="gender" required><select name="gender" value={formData.gender} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"><option value="">Select Gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></FormInput>
                        <FormInput label="Date of Birth" id="dob" required><input type="date" name="dob" value={formData.dob} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                        <FormInput label="Father's Name" id="fatherName" required><input type="text" name="fatherName" placeholder="Father name" value={formData.fatherName} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                        <FormInput label="Mother's Name" id="motherName" required><input type="text" name="motherName" placeholder="Mother name" value={formData.motherName} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                    </div>

                    <div className="mt-4 text-right">
                         <button type="button" onClick={() => setShowPersonalMore(!showPersonalMore)} className="text-blue-600 hover:text-blue-800 text-sm font-medium inline-flex items-center gap-1">
                             {showPersonalMore ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                            {showPersonalMore ? "Hide Optional Info" : "More Optional Info"}
                        </button>
                    </div>

                    {showPersonalMore && (
                        <div className="grid md:grid-cols-2 gap-5 mt-4 pt-4 border-t border-blue-100">
                             <FormInput label="Religion" id="religion"><input type="text" name="religion" placeholder="Religion" value={formData.religion} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                            <FormInput label="Nationality" id="nationality"><input type="text" name="nationality" value={formData.nationality} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                            <FormInput label="Birth Cert/NID/Passport No." id="idNumber"><input type="text" name="idNumber" value={formData.idNumber} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                            <FormInput label="Father NID" id="fatherNid"><input type="text" name="fatherNid" value={formData.fatherNid} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                            <FormInput label="Mother NID" id="motherNid"><input type="text" name="motherNid" value={formData.motherNid} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                            <FormInput label="Blood Group" id="bloodGroup"><select name="bloodGroup" value={formData.bloodGroup} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"><option value="">Select</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></FormInput>
                        </div>
                    )}
                </section>

                {/* Address & Contact */}
                <section className="p-5 bg-green-50 rounded-lg border border-green-200">
                    <h2 className="text-xl font-semibold mb-4 text-green-800">Address & Contact Details</h2>
                    <div className="grid md:grid-cols-2 gap-5">
                       <FormInput label="Emergency Contact Phone" id="emergencyContact" required><input type="tel" name="emergencyContact" value={formData.emergencyContact} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                       <div className="md:col-span-2">
                           <FormInput label="Present Address" id="address" required><textarea name="address" rows="3" placeholder="Full address" value={formData.address} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"></textarea></FormInput>
                       </div>
                    </div>

                    <div className="mt-4 text-right">
                         <button type="button" onClick={() => setShowAddressMore(!showAddressMore)} className="text-green-600 hover:text-green-800 text-sm font-medium inline-flex items-center gap-1">
                             {showAddressMore ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                            {showAddressMore ? "Hide Optional Info" : "More Optional Info"}
                        </button>
                    </div>

                    {showAddressMore && (
                        <div className="grid md:grid-cols-2 gap-5 mt-4 pt-4 border-t border-green-100">
                           <FormInput label="Primary Phone" id="primaryPhone"><input type="tel" name="primaryPhone" value={formData.primaryPhone} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                           <FormInput label="Guardian Name" id="guardianName"><input type="text" name="guardianName" value={formData.guardianName} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                           <FormInput label="Guardian Relationship" id="guardianRelationship"><input type="text" name="guardianRelationship" value={formData.guardianRelationship} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                            <FormInput label="Guardian Contact" id="guardianContact"><input type="tel" name="guardianContact" value={formData.guardianContact} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></FormInput>
                        </div>
                    )}
                </section>

                 {/* Skills & Social (All Optional) */}
                <section className="p-5 bg-purple-50 rounded-lg border border-purple-200">
                    <h2 className="text-xl font-semibold mb-4 text-purple-800">Skills & Social (Optional)</h2>
                     <FormInput label="Special Skills" id="skills">
                        <input type="text" name="skills" placeholder="e.g., Drawing, Coding, Sports" value={formData.skills} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-indigo-500" />
                    </FormInput>
                    <div className="grid md:grid-cols-2 gap-5">
                       <FormInput label="Facebook Profile Link" id="facebookLink">
                          <input type="url" name="facebookLink" placeholder="https://facebook.com/..." value={formData.facebookLink} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                       </FormInput>
                       <FormInput label="Email Address" id="email">
                           <input type="email" name="email" placeholder="student@example.com" value={formData.email} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                       </FormInput>
                    </div>
                </section>

                {/* Buttons */}
                <div className="flex justify-end gap-4 pt-6 border-t mt-6">
                    <button type="button" onClick={() => {/* TODO: Add close logic, e.g., navigate(-1) */}} className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">Close</button>
                    <button type="submit" disabled={isLoading || instLoading} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2 disabled:bg-indigo-300">
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                        {isLoading ? "Submitting..." : "Submit Admission"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default StudentAdmissionForm;