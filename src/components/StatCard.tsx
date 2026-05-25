type StatCardProps = {
  title: string;
  value: string;
};

function StatCard({ title, value }: StatCardProps) {
  return (
    <div className="statCard">
      <p>{title}</p>
      <strong>{value}</strong>
    </div>
  );
}

export default StatCard;