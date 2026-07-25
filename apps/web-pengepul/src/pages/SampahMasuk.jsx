import { useState, useEffect } from 'react';
import { FiInbox, FiCheck, FiX, FiEye, FiSearch, FiRefreshCw, FiEdit2 } from 'react-icons/fi';
import { getWaitingPickups, weighPickupItems, confirmAndCompletePickup, confirmDepositPickup } from '../api/pengepulAPI';
import Modal from '../components/UI/Modal';
import PageHeader from '../components/UI/PageHeader';
import { toast } from '../components/UI/Toast';

const STATUS_LABELS = {
  waiting_collector: { label: 'Menunggu', cls: 'pending' },
  weighing: { label: 'Proses Timbang', cls: 'draft' },
  completed: { label: 'Selesai', cls: 'completed' },
};

const TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'waiting_collector', label: 'Menunggu' },
  { key: 'weighing', label: 'Proses Timbang' },
  { key: 'completed', label: 'Selesai' },
];

const SampahMasuk = () => {
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [weighingModal, setWeighingModal] = useState(null);
  const [weighingItems, setWeighingItems] = useState([{ waste_type: '', weight: '' }]);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getWaitingPickups();
      setIncoming(res.data.data || []);
    } catch {
      toast.error("Gagal memuat data antrian");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleWeighSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const validItems = weighingItems.filter(i => i.waste_type && i.weight);
      if(validItems.length === 0) {
          toast.error("Pilih minimal 1 jenis sampah dan isi beratnya");
          return;
      }
      await weighPickupItems(weighingModal.id, validItems);
      toast.success("Berhasil ditimbang! Status: Proses Timbang");
      setWeighingModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan timbangan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmSelesai = async (id, paymentMethod) => {
      setSubmitting(true);
      try {
          await confirmAndCompletePickup(id, paymentMethod || 'saldo');
          toast.success(paymentMethod === 'cash' ? "Transaksi cash dicatat. Mohon konfirmasi setoran ke Pengepul." : "Transaksi selesai, saldo nasabah telah ditambahkan");
          fetchData();
          setDetailItem(null);
      } catch(err) {
          toast.error(err.response?.data?.message || 'Gagal menyelesaikan transaksi');
      } finally {
          setSubmitting(false);
      }
  };

  const handleConfirmDeposit = async (id) => {
      setSubmitting(true);
      try {
          await confirmDepositPickup(id);
          toast.success("Setoran cash dari Petugas berhasil dikonfirmasi!");
          fetchData();
          setDetailItem(null);
      } catch(err) {
          toast.error(err.response?.data?.message || 'Gagal mengkonfirmasi setoran');
      } finally {
          setSubmitting(false);
      }
  };

  const filtered = incoming.filter(item => {
    const matchTab = activeTab === 'all' || item.status === activeTab;
    const q = search.toLowerCase();
    const matchSearch = !q || item.nama_warga?.toLowerCase().includes(q)
      || item.nama_petugas?.toLowerCase().includes(q)
      || item.waste_type?.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const counts = {
    all: incoming.length,
    waiting_collector: incoming.filter(i => i.status === 'waiting_collector').length,
    weighing: incoming.filter(i => i.status === 'weighing').length,
    completed: incoming.filter(i => i.status === 'completed').length,
  };

  return (
    <div>
      <PageHeader
        title="Sampah Masuk"
        subtitle="Data kiriman sampah dari petugas lapangan"
        action={
          <button className="btn btn-secondary btn-sm" onClick={fetchData}>
            <FiRefreshCw /> Refresh
          </button>
        }
      />

      {/* Filter Tabs */}
      <div className="tabs" style={{ width: '100%', marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            <span style={{
              background: activeTab === t.key ? 'var(--primary)' : 'var(--surface-light)',
              color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700,
              padding: '1px 7px', marginLeft: 4
            }}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="glass-card">
        {/* Search Bar */}
        <div className="filter-bar">
          <div className="search-input-wrap" style={{ maxWidth: 340 }}>
            <FiSearch className="search-icon" />
            <input
              type="text"
              className="input-control"
              placeholder="Cari petugas, warga, jenis sampah..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner"></div><span>Memuat data...</span></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Warga</th>
                  <th>Petugas</th>
                  <th>Jenis Sampah</th>
                  <th>Berat (Kg)</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const st = STATUS_LABELS[item.status] || { label: item.status, cls: 'draft' };
                  return (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(item.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ fontWeight: 600 }}>{item.user_name || `User #${item.user_id}`}</td>
                      <td>{item.petugas_name || `Petugas #${item.petugas_id}`}</td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 18 }}>
                            {item.waste_type === 'Besi' ? '🔩' : item.waste_type === 'Kardus' ? '📦' : '♻️'}
                          </span>
                          {item.waste_type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{item.estimated_weight} Kg</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm btn-icon"
                            title="Detail"
                            onClick={() => { setDetailItem(item); }}
                          >
                            <FiEye />
                          </button>
                          {item.status === 'waiting_collector' && (
                            <button
                                className="btn btn-primary btn-sm btn-icon"
                                title="Mulai Timbang"
                                onClick={() => {
                                    setWeighingModal(item);
                                    setWeighingItems([{ waste_type: item.waste_type, weight: item.estimated_weight }]);
                                }}
                            >
                                <FiEdit2 />
                            </button>
                          )}
                          {item.status === 'weighing' && (
                            <button
                                className="btn btn-success btn-sm btn-icon"
                                title="Konfirmasi Transaksi Saldo"
                                onClick={() => handleConfirmSelesai(item.id, 'saldo')}
                            >
                                <FiCheck />
                            </button>
                          )}
                          {/* Tombol konfirmasi setoran cash — muncul jika completed via cash dan belum dikonfirmasi */}
                          {item.status === 'completed' && item.deposit_status === 'pending' && (
                            <button
                                className="btn btn-warning btn-sm"
                                title="Konfirmasi Terima Setoran Cash"
                                onClick={() => handleConfirmDeposit(item.id)}
                                style={{ fontSize: 11, padding: '4px 8px' }}
                            >
                                💵 Konfirmasi Setoran
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="7">
                      <div className="empty-state">
                        <div className="empty-state-icon">📭</div>
                        <h3>Tidak ada data</h3>
                        <p>Belum ada kiriman sampah untuk filter ini.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detail */}
      <Modal isOpen={!!detailItem} onClose={() => setDetailItem(null)} title="Detail Kiriman Sampah" size="md">
        {detailItem && (
          <div>
            <div className="info-row mb-20">
              {[
                { label: 'ID Transaksi', value: `#${detailItem.id}` },
                { label: 'Tanggal', value: new Date(detailItem.created_at).toLocaleString('id-ID') },
                { label: 'Nasabah', value: detailItem.user_name || detailItem.user_id },
                { label: 'Petugas', value: detailItem.petugas_name || detailItem.petugas_id },
                { label: 'Jenis Sampah (Estimasi)', value: detailItem.waste_type },
                { label: 'Estimasi Berat', value: `${detailItem.estimated_weight} Kg` },
                { label: 'Total Harga', value: `Rp ${Number(detailItem.total_price || 0).toLocaleString('id-ID')}` },
                { label: 'Status', value: STATUS_LABELS[detailItem.status]?.label || detailItem.status },
              ].map(({ label, value }) => (
                <div key={label} className="info-item">
                  <span className="info-label">{label}</span>
                  <span className="info-value">{value}</span>
                </div>
              ))}
            </div>

            {detailItem.status === 'weighing' && (
                <button
                    className="btn btn-success btn-lg"
                    style={{ width: '100%', marginTop: 20 }}
                    onClick={() => handleConfirmSelesai(detailItem.id)}
                    disabled={submitting}
                >
                    <FiCheck /> Konfirmasi & Selesaikan Transaksi
                </button>
            )}
            {detailItem.status === 'waiting_collector' && (
                <button
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', marginTop: 20 }}
                    onClick={() => {
                        setDetailItem(null);
                        setWeighingModal(detailItem);
                        setWeighingItems([{ waste_type: detailItem.waste_type, weight: detailItem.estimated_weight }]);
                    }}
                >
                    <FiEdit2 /> Mulai Timbang
                </button>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Penimbangan */}
      <Modal isOpen={!!weighingModal} onClose={() => setWeighingModal(null)} title={`Penimbangan Order #${weighingModal?.id}`} size="md">
        {weighingModal && (
          <form onSubmit={handleWeighSubmit}>
            <div style={{ marginBottom: 15, padding: 15, background: 'var(--surface-light)', borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sampah Awal (Estimasi Nasabah)</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{weighingModal.waste_type} - {weighingModal.estimated_weight} Kg</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {weighingItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <select 
                            className="input-control" 
                            style={{ flex: 2 }}
                            value={item.waste_type}
                            onChange={e => {
                                const newItems = [...weighingItems];
                                newItems[idx].waste_type = e.target.value;
                                setWeighingItems(newItems);
                            }}
                            required
                        >
                            <option value="">Pilih Jenis</option>
                            <option value="Plastik PET">Plastik PET</option>
                            <option value="Kardus">Kardus</option>
                            <option value="Besi">Besi</option>
                            <option value="Aluminium">Aluminium</option>
                            <option value="Kaca">Kaca</option>
                            <option value="Plastik Campur">Plastik Campur</option>
                            <option value="Kertas">Kertas</option>
                        </select>
                        <input 
                            type="number" 
                            className="input-control" 
                            style={{ flex: 1 }}
                            step="0.01"
                            placeholder="Berat (kg)"
                            value={item.weight}
                            onChange={e => {
                                const newItems = [...weighingItems];
                                newItems[idx].weight = e.target.value;
                                setWeighingItems(newItems);
                            }}
                            required
                        />
                        {weighingItems.length > 1 && (
                            <button type="button" className="btn btn-danger btn-icon" onClick={() => {
                                setWeighingItems(weighingItems.filter((_, i) => i !== idx));
                            }}>
                                <FiX />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                setWeighingItems([...weighingItems, { waste_type: '', weight: '' }]);
            }} style={{ marginBottom: 20 }}>
                + Tambah Jenis Sampah
            </button>

            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={submitting}>
                {submitting ? 'Menyimpan...' : 'Simpan Timbangan'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default SampahMasuk;
